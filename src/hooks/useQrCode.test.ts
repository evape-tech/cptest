import { act, renderHook } from '@testing-library/react';
import { useQrCode } from './useQrCode';
import { WebSocketStatus } from '../useWebSocket';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('single station automatically requests on connection and discards responses from an old connection', () => {
  const socket = { readyState: 1, send: jest.fn() };
  const socketRef = { current: socket as unknown as WebSocket };
  const h = renderHook(({ status }: { status: WebSocketStatus }) => useQrCode(socketRef, status),
    { initialProps: { status: 'DISCONNECTED' as WebSocketStatus } });
  expect(socket.send).not.toHaveBeenCalled();
  h.rerender({ status: 'CONNECTED' });
  const first = JSON.parse(socket.send.mock.calls[0][0]);
  expect(first.slice(2)).toEqual(['DataTransfer', { vendorId: 'efaner', messageId: 'GetQrCode' }]);
  act(() => { h.result.current.handleQrMessage(JSON.stringify([3, first[1], { status: 'Accepted', data: 'CP00501' }])); });
  expect(h.result.current.qrState.content).toBe('CP00501');
  h.rerender({ status: 'DISCONNECTED' });
  expect(h.result.current.qrState.symbol).toBeNull();
  h.rerender({ status: 'CONNECTED' });
  const second = JSON.parse(socket.send.mock.calls[1][0]);
  expect(second[1]).not.toBe(first[1]);
  act(() => { h.result.current.handleQrMessage(JSON.stringify([3, first[1], { status: 'Accepted', data: 'OLD' }])); });
  expect(h.result.current.qrState.phase).toBe('loading');
  h.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
