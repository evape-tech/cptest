import { BatchConfig, BatchStation, stationIds, validateBatchConfig } from './batchSimulator';

const config: BatchConfig = { endpoint: 'wss://example.invalid/ocpp', prefix: 'TESTAC', firstNumber: 1,
  count: 50, idTag: 'TEST', powerKw: 7, meterSeconds: 10, connectGapMs: 0, authorizeRemoteTxRequests: false };

// In-memory transport: no sockets, network services or external backend are opened.
class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  messages: any[][] = [];
  heldStart: any[] | null = null;
  holdStart = false;
  authStatus = 'Accepted';
  qrContent = 'CP00501';
  holdQr = false;
  constructor(readonly tx: number) {}
  send(raw: string) {
    const message = JSON.parse(raw);
    this.messages.push(message);
    if (message[0] !== 2) return;
    const [, uid, action] = message;
    if (action === 'StartTransaction' && this.holdStart) { this.heldStart = message; return; }
    if (action === 'DataTransfer' && this.holdQr) return;
    const result = action === 'BootNotification' ? { status: 'Accepted', interval: 30 }
      : action === 'Authorize' ? { idTagInfo: { status: this.authStatus } }
      : action === 'StartTransaction' ? { transactionId: this.tx, idTagInfo: { status: 'Accepted' } }
      : action === 'DataTransfer' ? { status: 'Accepted', data: this.qrContent } : {};
    this.reply([3, uid, result]);
  }
  reply(message: any[]) { this.onmessage?.({ data: JSON.stringify(message) }); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  releaseStart() {
    if (this.heldStart) this.reply([3, this.heldStart[1], { transactionId: this.tx, idTagInfo: { status: 'Accepted' } }]);
  }
}

const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function create(cpid = 'TESTAC001', tx = 0, authorizeRemoteTxRequests = false) {
  const socket = new FakeSocket(tx);
  const factory = jest.fn(() => socket as unknown as WebSocket);
  const station = new BatchStation({ ...config, authorizeRemoteTxRequests }, cpid, () => {}, factory);
  return { station, socket, factory };
}
async function connect(station: BatchStation, socket: FakeSocket) {
  const task = station.connect(); socket.open(); await task;
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('applying 50 or 100 unique CPIDs never creates a socket', () => {
  expect(stationIds(config)).toHaveLength(50);
  expect(stationIds(config)[49]).toBe('TESTAC050');
  expect(new Set(stationIds({ ...config, count: 100 })).size).toBe(100);
  const { factory } = create();
  expect(factory).not.toHaveBeenCalled();
  expect(() => validateBatchConfig({ ...config, endpoint: '' })).toThrow();
  expect(() => stationIds({ ...config, count: 101 })).toThrow();
});

test('batch station automatically gets its QR, refreshes it and clears it on failure or disconnect', async () => {
  const { station, socket } = create('DIFFERENT_CPID');
  await connect(station, socket);
  const first = socket.messages.find(m => m[2] === 'DataTransfer')!;
  expect(first[3]).toEqual({ vendorId: 'efaner', messageId: 'GetQrCode' });
  expect(station.snapshot.qrState.content).toBe('CP00501');
  socket.qrContent = ' CHANGED\n';
  station.refreshQr();
  expect(station.snapshot.qrState.content).toBe(' CHANGED\n');
  socket.holdQr = true;
  station.refreshQr();
  expect(station.snapshot.qrState.symbol).toBeNull();
  jest.advanceTimersByTime(15000); await flush();
  expect(station.snapshot.qrState.phase).toBe('error');
  expect(station.snapshot.phase).toBe('Available');
  socket.holdQr = false; station.refreshQr();
  await station.disconnect();
  expect(station.snapshot.qrState.symbol).toBeNull();
});

test('50 stations register and charge independently, then stop all meter reporting', async () => {
  const items = stationIds(config).map((id, i) => create(id, i));
  await Promise.all(items.map(({ station, socket }) => connect(station, socket)));
  await Promise.all(items.map(({ station }) => station.start()));
  expect(items.every(({ station }) => station.snapshot.phase === 'Charging')).toBe(true);
  expect(new Set(items.map(({ station }) => station.snapshot.transactionId)).size).toBe(50);
  jest.advanceTimersByTime(10000); await flush();
  items.forEach(({ station, socket }, i) => {
    expect(station.snapshot.energyWh).toBeCloseTo(19.444, 2);
    expect(socket.messages.find(m => m[2] === 'MeterValues')?.[3].transactionId).toBe(i);
  });
  await Promise.all(items.map(({ station }) => station.stop()));
  expect(items.every(({ station }) => station.snapshot.transactionId === null)).toBe(true);
  jest.advanceTimersByTime(20000); await flush();
  expect(items.every(({ socket }) => socket.messages.filter(m => m[2] === 'MeterValues').length === 1)).toBe(true);
  await Promise.all(items.map(({ station }) => station.disconnect()));
  expect(jest.getTimerCount()).toBe(0);
});

test('rejected authorization never sends StartTransaction', async () => {
  const { station, socket } = create(); socket.authStatus = 'Invalid';
  await connect(station, socket); await station.start();
  expect(socket.messages.some(m => m[2] === 'StartTransaction')).toBe(false);
  expect(station.snapshot.errors).toBe(1);
  station.dispose();
});

test('disconnect during pending start closes the late accepted transaction without starting a meter', async () => {
  const { station, socket } = create(); await connect(station, socket);
  socket.holdStart = true;
  const start = station.start(); await flush();
  expect(socket.heldStart).not.toBeNull();
  const disconnect = station.disconnect(); socket.releaseStart();
  await start; await disconnect;
  expect(socket.messages.some(m => m[2] === 'StopTransaction' && m[3].transactionId === 0)).toBe(true);
  expect(station.snapshot.transactionId).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

test('remote start and stop correlate the requested transaction, including ID zero', async () => {
  const { station, socket } = create(); await connect(station, socket);
  socket.reply([2, 'start-command', 'RemoteStartTransaction', { connectorId: 1, idTag: 'REMOTE' }]);
  await flush(); expect(station.snapshot.phase).toBe('Charging');
  expect(socket.messages.some(m => m[2] === 'Authorize')).toBe(false);
  socket.reply([2, 'wrong-stop', 'RemoteStopTransaction', { transactionId: 999 }]);
  expect(socket.messages.find(m => m[1] === 'wrong-stop')?.[2].status).toBe('Rejected');
  socket.reply([2, 'stop-command', 'RemoteStopTransaction', { transactionId: 0 }]);
  await flush(); expect(station.snapshot.transactionId).toBeNull();
  station.dispose();
});

test('remote authorization true uses the remote idTag and authorizes before starting', async () => {
  const { station, socket } = create('TESTAC001', 1, true); await connect(station, socket);
  socket.reply([2, 'remote', 'RemoteStartTransaction', { connectorId: 1, idTag: 'REMOTE_TAG' }]);
  await flush();
  expect(socket.messages.find(m => m[2] === 'Authorize')?.[3].idTag).toBe('REMOTE_TAG');
  expect(socket.messages.findIndex(m => m[2] === 'Authorize')).toBeLessThan(socket.messages.findIndex(m => m[2] === 'StartTransaction'));
  expect(station.snapshot.phase).toBe('Charging');
  await station.disconnect();
});

test('remote authorization true blocks denied tags', async () => {
  const { station, socket } = create('TESTAC001', 1, true); socket.authStatus = 'Blocked';
  await connect(station, socket);
  socket.reply([2, 'remote', 'RemoteStartTransaction', { connectorId: 1, idTag: 'REMOTE_TAG' }]);
  await flush();
  expect(socket.messages.some(m => m[2] === 'StartTransaction')).toBe(false);
  expect(station.snapshot.transactionId).toBeNull();
  expect(station.snapshot.lastError).toContain('Blocked');
  station.dispose();
});

test('start timeout is visible and cannot silently start a duplicate transaction', async () => {
  const { station, socket } = create(); await connect(station, socket);
  socket.holdStart = true;
  const task = station.start(); await flush();
  jest.advanceTimersByTime(15001); await task;
  expect(station.snapshot.phase).toBe('啟動結果待確認');
  await station.start();
  expect(socket.messages.filter(m => m[2] === 'StartTransaction')).toHaveLength(1);
  station.dispose();
});
