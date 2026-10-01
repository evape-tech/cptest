import { act, renderHook } from '@testing-library/react';
import { useOcppMessageHandler } from './useOcppMessageHandler';

function setup(authorizeRemoteTxRequests: boolean) {
  const socket = { readyState: 1, send: jest.fn() };
  const socketRef = { current: socket };
  const appendLog = jest.fn();
  const props: any = new Proxy({ authorizeRemoteTxRequests, socketRef, appendLog, chargerType: 'AC', connectorId: 1 },
    { get: (target: any, key) => key in target ? target[key] : jest.fn() });
  const hook = renderHook(() => useOcppMessageHandler(props));
  const receive = async (data: any[]) => {
    await act(async () => { hook.result.current.handleMessage({ data: JSON.stringify(data) } as MessageEvent); });
  };
  const messages = () => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
  return { ...hook, receive, messages, appendLog, socketRef };
}

beforeEach(() => { jest.useFakeTimers(); jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('false preserves remote start without an extra Authorize', async () => {
  const h = setup(false);
  await h.receive([2, 'remote', 'RemoteStartTransaction', { connectorId: 1, idTag: 'REMOTE' }]);
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.messages().some(m => m[2] === 'Authorize')).toBe(false);
  expect(h.messages().find(m => m[2] === 'StartTransaction')?.[3].idTag).toBe('REMOTE');
  h.unmount();
});

test('true waits for the matching accepted authorization before starting', async () => {
  const h = setup(true);
  await h.receive([2, 'remote', 'RemoteStartTransaction', { idTag: 'REMOTE' }]);
  const auth = h.messages().find(m => m[2] === 'Authorize');
  expect(auth[3].idTag).toBe('REMOTE');
  await h.receive([3, 'unrelated-authorize', { idTagInfo: { status: 'Accepted' } }]);
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.messages().some(m => m[2] === 'StartTransaction')).toBe(false);
  await h.receive([3, auth[1], { idTagInfo: { status: 'Accepted' } }]);
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.messages().filter(m => m[2] === 'StartTransaction')).toHaveLength(1);
  h.unmount();
});

test.each(['Blocked', 'Invalid', 'Expired'])('true does not start when authorization is %s', async status => {
  const h = setup(true);
  await h.receive([2, 'remote', 'RemoteStartTransaction', { idTag: 'REMOTE' }]);
  const auth = h.messages().find(m => m[2] === 'Authorize');
  await h.receive([3, auth[1], { idTagInfo: { status } }]);
  act(() => { jest.advanceTimersByTime(1000); });
  expect(h.messages().some(m => m[2] === 'StartTransaction')).toBe(false);
  expect(h.appendLog).toHaveBeenCalledWith(expect.stringContaining(status));
  h.unmount();
});

test('authorization timeout and a late response do not start a transaction', async () => {
  const h = setup(true);
  await h.receive([2, 'remote', 'RemoteStartTransaction', { idTag: 'REMOTE' }]);
  const auth = h.messages().find(m => m[2] === 'Authorize');
  await act(async () => { jest.advanceTimersByTime(15001); });
  await h.receive([3, auth[1], { idTagInfo: { status: 'Accepted' } }]);
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.messages().some(m => m[2] === 'StartTransaction')).toBe(false);
  expect(h.appendLog).toHaveBeenCalledWith(expect.stringContaining('逾時'));
  h.unmount();
});

test('authorization CALLERROR blocks the transaction', async () => {
  const h = setup(true);
  await h.receive([2, 'remote', 'RemoteStartTransaction', { idTag: 'REMOTE' }]);
  const auth = h.messages().find(m => m[2] === 'Authorize');
  await h.receive([4, auth[1], 'InternalError', 'test', {}]);
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.messages().some(m => m[2] === 'StartTransaction')).toBe(false);
  h.unmount();
});
