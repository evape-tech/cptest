import { EMPTY_QR, QrCodeRequest, QrState } from './qrCode';

export interface BatchConfig {
  authorizeRemoteTxRequests: boolean;
  endpoint: string;
  prefix: string;
  firstNumber: number;
  count: number;
  idTag: string;
  powerKw: number;
  meterSeconds: number;
  connectGapMs: number;
}

export interface StationSnapshot {
  qrState: QrState;
  cpid: string;
  connected: boolean;
  phase: string;
  transactionId: number | null;
  energyWh: number;
  sent: number;
  received: number;
  errors: number;
  lastRttMs: number | null;
  lastError: string;
}

export function stationIds(config: BatchConfig): string[] {
  if (!Number.isInteger(config.count) || config.count < 1 || config.count > 100) {
    throw new Error('台數必須是 1～100 的整數');
  }
  if (!Number.isSafeInteger(config.firstNumber) || config.firstNumber < 1 ||
      !Number.isSafeInteger(config.firstNumber + config.count - 1)) {
    throw new Error('起始編號必須是有效的正整數');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(config.prefix)) throw new Error('CPID 前綴只接受英文、數字、底線與連字號');
  const ids = Array.from({ length: config.count }, (_, i) =>
    `${config.prefix}${String(config.firstNumber + i).padStart(3, '0')}`);
  if (ids.some(id => id.length > 100)) throw new Error('CPID 過長');
  return ids;
}

export function validateBatchConfig(config: BatchConfig): string[] {
  const url = new URL(config.endpoint.trim());
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('請填入 ws:// 或 wss:// 後台網址，不含 CPID、帳密、查詢參數或片段');
  }
  if (!config.idTag.trim() || config.idTag.trim().length > 20) throw new Error('idTag 必須為 1～20 個字元');
  if (!Number.isFinite(config.powerKw) || config.powerKw <= 0 || config.powerKw > 100) throw new Error('模擬功率必須大於 0 且不超過 100 kW');
  if (!Number.isInteger(config.meterSeconds) || config.meterSeconds < 1 || config.meterSeconds > 3600) throw new Error('電表回報間隔必須是 1～3600 秒');
  if (!Number.isInteger(config.connectGapMs) || config.connectGapMs < 0 || config.connectGapMs > 10000) throw new Error('連線間隔必須是 0～10000 毫秒');
  return stationIds(config);
}

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  started: number;
};

// Each station owns its socket, pending requests, transaction and timers.
export class BatchStation {
  snapshot: StationSnapshot;
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private heartbeat?: ReturnType<typeof setInterval>;
  private meter?: ReturnType<typeof setInterval>;
  private openTimer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private closing = false;
  private lastMeterTime = 0;
  private activeTag = '';
  private startTask: Promise<void> | null = null;
  private stopTask: Promise<void> | null = null;
  private qr: QrCodeRequest;

  constructor(
    private config: BatchConfig,
    cpid: string,
    private log: (message: string) => void,
    private socketFactory: (url: string, protocol: string) => WebSocket = (url, protocol) => new WebSocket(url, protocol),
  ) {
    this.snapshot = { cpid, connected: false, phase: '未連線', transactionId: null,
      energyWh: 0, sent: 0, received: 0, errors: 0, lastRttMs: null, lastError: '', qrState: { ...EMPTY_QR } };
    this.qr = new QrCodeRequest(state => {
      this.snapshot.qrState = state;
      if (state.phase === 'error') this.fail(state.error);
    });
  }

  refreshQr() {
    if (this.closing) { this.qr.reset(); return; }
    this.qr.request(message => this.send(message));
  }

  private note(message: string) { this.log(`${this.snapshot.cpid}：${message}`); }
  private fail(error: unknown) {
    this.snapshot.errors++;
    this.snapshot.lastError = error instanceof Error ? error.message : String(error);
    this.note(this.snapshot.lastError);
  }
  private send(message: unknown[]) {
    if (this.socket?.readyState !== 1) throw new Error('連線未開啟');
    this.socket.send(JSON.stringify(message));
    this.snapshot.sent++;
  }
  private request(action: string, payload: object): Promise<any> {
    const uid = `${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(uid);
        reject(new Error(`${action} 回覆逾時（15 秒）`));
      }, 15000);
      this.pending.set(uid, { resolve, reject, timer, started: Date.now() });
      try { this.send([2, uid, action, payload]); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(uid);
        reject(error);
      }
    });
  }
  private status(status: string) {
    return this.request('StatusNotification', { connectorId: 1, status,
      errorCode: 'NoError', timestamp: new Date().toISOString() });
  }
  private clearTimers() {
    clearTimeout(this.openTimer);
    clearInterval(this.heartbeat);
    clearInterval(this.meter);
  }

  async connect() {
    if (this.socket) return;
    this.snapshot.phase = '連線中';
    try {
      const url = `${this.config.endpoint.trim().replace(/\/+$/, '')}/${encodeURIComponent(this.snapshot.cpid)}`;
      const socket = this.socketFactory(url, 'ocpp1.6');
      this.socket = socket;
      await new Promise<void>((resolve, reject) => {
        this.openTimer = setTimeout(() => { reject(new Error('WebSocket 連線逾時')); socket.close(); }, 15000);
        socket.onopen = () => { clearTimeout(this.openTimer); this.snapshot.connected = true; resolve(); };
        socket.onerror = () => {
          this.qr.fail('OCPP 連線發生錯誤');
          reject(new Error('WebSocket 連線失敗，請確認網址、CPID 與認證需求'));
        };
        socket.onclose = () => {
          this.qr.reset();
          this.clearTimers();
          this.snapshot.connected = false;
          this.snapshot.phase = this.snapshot.transactionId !== null ? '離線／交易待確認' : '已斷線';
          this.pending.forEach(item => { clearTimeout(item.timer); item.reject(new Error('連線已關閉')); });
          this.pending.clear();
          reject(new Error('WebSocket 已關閉'));
        };
        socket.onmessage = event => this.receive(event.data);
      });
      if (this.closing) return;
      this.refreshQr();
      this.snapshot.phase = '註冊中';
      const result = await this.request('BootNotification', {
        chargePointVendor: 'DemoVendor', chargePointModel: 'AC-Batch-Simulator',
        chargePointSerialNumber: this.snapshot.cpid, firmwareVersion: '1.0.0',
      });
      if (result.status !== 'Accepted') throw new Error(`註冊未接受：${result.status}`);
      if (this.closing) return;
      const seconds = Number.isFinite(result.interval) && result.interval > 0 ? Math.min(result.interval, 86400) : 30;
      this.heartbeat = setInterval(() => { void this.request('Heartbeat', {}).catch(e => this.fail(e)); }, seconds * 1000);
      await this.status('Available');
      if (!this.closing) { this.snapshot.phase = 'Available'; this.note('註冊成功'); }
    } catch (error) { this.fail(error); this.dispose(); }
  }

  private receive(raw: string) {
    this.snapshot.received++;
    if (this.qr.receive(raw)) return;
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return; // Some servers also send service-identity metadata.
      const [type, uid, payload] = data;
      if (type === 3 || type === 4) {
        const item = this.pending.get(uid);
        if (!item) return;
        clearTimeout(item.timer);
        this.pending.delete(uid);
        this.snapshot.lastRttMs = Date.now() - item.started;
        if (type === 4) item.reject(new Error(`${payload}: ${data[3] || ''}`));
        else if (!payload || typeof payload !== 'object' || Array.isArray(payload)) item.reject(new Error('無效的 OCPP 回覆'));
        else item.resolve(payload);
      } else if (type === 2) {
        this.handleCall(uid, data[2], data[3] || {});
      }
    } catch (error) { this.fail(error); }
  }

  private handleCall(uid: string, action: string, payload: any) {
    if (action === 'RemoteStartTransaction') {
      const allowed = !this.closing && !this.startTask && !this.stopTask && this.snapshot.transactionId === null &&
        ['Available', 'Preparing'].includes(this.snapshot.phase) &&
        typeof payload.idTag === 'string' && payload.idTag.length > 0 && payload.idTag.length <= 20 &&
        (payload.connectorId === undefined || payload.connectorId === 1) && !payload.chargingProfile;
      this.send([3, uid, { status: allowed ? 'Accepted' : 'Rejected' }]);
      if (allowed) void this.start(payload.idTag, this.config.authorizeRemoteTxRequests);
    } else if (action === 'RemoteStopTransaction') {
      const allowed = !this.closing && !this.startTask && !this.stopTask && this.snapshot.transactionId !== null && payload.transactionId === this.snapshot.transactionId;
      this.send([3, uid, { status: allowed ? 'Accepted' : 'Rejected' }]);
      if (allowed) void this.stop('Remote');
    } else if (action === 'SetChargingProfile') {
      this.send([3, uid, { status: 'NotSupported' }]);
    } else {
      this.send([4, uid, 'NotImplemented', '此批次模擬器未實作此指令', {}]);
    }
  }

  async plug() {
    if (this.closing || this.snapshot.phase !== 'Available') return;
    this.snapshot.phase = 'Preparing';
    try { await this.status('Preparing'); }
    catch (error) { this.fail(error); }
  }

  start(tag = this.config.idTag.trim(), authorize = true): Promise<void> {
    if (this.closing || this.startTask || this.stopTask || this.snapshot.transactionId !== null ||
        !['Available', 'Preparing'].includes(this.snapshot.phase)) return Promise.resolve();
    this.startTask = this.startSession(tag, authorize).finally(() => { this.startTask = null; });
    return this.startTask;
  }
  private async startSession(tag: string, authorize: boolean) {
    let startRequested = false;
    try {
      const wasAvailable = this.snapshot.phase === 'Available';
      this.snapshot.phase = '啟動中';
      if (wasAvailable) await this.status('Preparing');
      if (this.closing) return;
      if (authorize) {
        const auth = await this.request('Authorize', { idTag: tag });
        if (auth.idTagInfo?.status !== 'Accepted') throw new Error(`授權未接受：${auth.idTagInfo?.status}`);
      }
      if (this.closing) return;
      startRequested = true;
      const result = await this.request('StartTransaction', { connectorId: 1, idTag: tag,
        meterStart: Math.round(this.snapshot.energyWh), timestamp: new Date().toISOString() });
      if (!Number.isInteger(result.transactionId)) throw new Error('後台未回傳有效交易 ID');
      this.snapshot.transactionId = result.transactionId;
      this.activeTag = tag;
      if (result.idTagInfo?.status !== 'Accepted') {
        await this.stop('DeAuthorized');
        throw new Error(`交易未授權：${result.idTagInfo?.status}`);
      }
      if (this.closing) return; // disconnect() will close this accepted transaction.
      await this.status('Charging');
      if (this.closing) return;
      this.snapshot.phase = 'Charging';
      this.lastMeterTime = Date.now();
      this.meter = setInterval(() => {
        this.integrateEnergy();
        void this.request('MeterValues', { connectorId: 1, transactionId: this.snapshot.transactionId,
          meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [
            { value: this.snapshot.energyWh.toFixed(3), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
            { value: String(this.config.powerKw * 1000), measurand: 'Power.Active.Import', unit: 'W' },
          ] }] }).catch(e => this.fail(e));
      }, this.config.meterSeconds * 1000);
      this.note(`充電中，交易 ${result.transactionId}`);
    } catch (error) {
      this.fail(error);
      this.snapshot.phase = this.snapshot.connected
        ? (this.snapshot.transactionId !== null ? '交易待處理' : startRequested ? '啟動結果待確認' : 'Preparing') : '已斷線';
    }
  }
  private integrateEnergy() {
    if (this.snapshot.phase !== 'Charging') return;
    const now = Date.now();
    this.snapshot.energyWh += this.config.powerKw * 1000 * (now - this.lastMeterTime) / 3600000;
    this.lastMeterTime = now;
  }
  stop(reason = 'Local'): Promise<void> {
    if (this.startTask && reason !== 'DeAuthorized') return this.startTask.then(() => this.stop(reason));
    if (this.stopTask) return this.stopTask;
    this.integrateEnergy();
    clearInterval(this.meter);
    this.stopTask = this.stopSession(reason).finally(() => { this.stopTask = null; });
    return this.stopTask;
  }
  private async stopSession(reason: string) {
    if (this.snapshot.transactionId === null) return;
    this.snapshot.phase = '停止中';
    try {
      await this.status('Finishing').catch(e => this.fail(e));
      await this.request('StopTransaction', { transactionId: this.snapshot.transactionId,
        idTag: this.activeTag, meterStop: Math.round(this.snapshot.energyWh),
        timestamp: new Date().toISOString(), reason });
      this.snapshot.transactionId = null;
      await this.status('Available');
      this.snapshot.phase = 'Available';
      this.note('交易已停止');
    } catch (error) { this.fail(error); this.snapshot.phase = '停止失敗／待確認'; }
  }

  async disconnect() {
    this.closing = true;
    await this.startTask;
    await this.stop();
    this.dispose();
  }
  dispose() {
    this.closing = true;
    this.qr.reset();
    this.clearTimers();
    this.pending.forEach(item => { clearTimeout(item.timer); item.reject(new Error('模擬器已結束')); });
    this.pending.clear();
    this.socket?.close();
    this.snapshot.connected = false;
    this.snapshot.phase = this.snapshot.transactionId !== null ? '離線／交易待確認' : '已斷線';
  }
}
