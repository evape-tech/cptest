import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import jsQR from 'jsqr';
import { ChargerQrCode } from './components/ChargerQrCode';
import { EMPTY_QR, QrCodeRequest, QrState, QR_TIMEOUT_MS } from './qrCode';

function setup() {
  let state: QrState = { ...EMPTY_QR };
  const client = new QrCodeRequest(next => { state = next; });
  const send = jest.fn();
  const request = () => { client.request(send); return send.mock.calls[send.mock.calls.length - 1][0][1]; };
  const reply = (uid: string, result: unknown) => client.receive(JSON.stringify([3, uid, result]));
  return { client, send, request, reply, state: () => state };
}

// Decode pixels reconstructed from the actual rendered SVG, not from its text label.
function decodeDisplayedQr() {
  const svg = screen.getByRole('img', { name: '後台回傳內容的 QR Code' });
  const modules = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
  const scale = 8;
  const width = modules * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const path = svg.querySelector('path')!.getAttribute('d')!;
  for (const match of Array.from(path.matchAll(/M(\d+) (\d+)h1v1h-1z/g))) {
    const x = Number(match[1]) * scale;
    const y = Number(match[2]) * scale;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const index = ((y + dy) * width + x + dx) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    }
  }
  return jsQR(pixels, width, width)?.data;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test.each(['CP00501', ' CP00501\n', 'https://example.invalid/a?x=1&y=中文', '樁🔌\n\t內容'])('rendered QR decodes to the exact backend string: %j', content => {
  const q = setup(); const uid = q.request();
  expect(q.send).toHaveBeenLastCalledWith([2, uid, 'DataTransfer', { vendorId: 'efaner', messageId: 'GetQrCode' }]);
  expect(uid).not.toBe('12345678');
  expect(q.reply(uid, { status: 'Accepted', data: content })).toBe(true);
  render(<ChargerQrCode state={q.state()} connected onRefresh={() => {}} />);
  expect(screen.getByTestId('qr-content').textContent).toBe(content);
  expect(decodeDisplayedQr()).toBe(content);
});

test('refresh clears the displayed QR immediately and only the current UID may update it', () => {
  const q = setup(); const old = q.request(); q.reply(old, { status: 'Accepted', data: 'OLD' });
  const onRefresh = jest.fn(() => q.request());
  const view = render(<ChargerQrCode state={q.state()} connected onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: '重新取得 QR Code' }));
  const fresh = onRefresh.mock.results[0].value;
  expect(fresh).not.toBe(old);
  view.rerender(<ChargerQrCode state={q.state()} connected onRefresh={onRefresh} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(q.reply(old, { status: 'Accepted', data: 'STALE' })).toBe(false);
  expect(q.reply('unrelated', { status: 'Accepted', data: 'WRONG' })).toBe(false);
  q.reply(fresh, { status: 'Accepted', data: 'NEW' });
  view.rerender(<ChargerQrCode state={q.state()} connected onRefresh={onRefresh} />);
  expect(decodeDisplayedQr()).toBe('NEW');
});

test.each([
  { status: 'Rejected', data: 'OLD' }, { status: 'UnknownVendorId', data: 'OLD' },
  { status: 'Accepted', data: '' }, { status: 'Accepted', data: null },
  { status: 'Accepted', data: 123 }, { status: 'Accepted', data: {} }, null,
])('invalid reply clears old QR and shows failure: %j', result => {
  const q = setup(); q.reply(q.request(), { status: 'Accepted', data: 'OLD' });
  q.reply(q.request(), result);
  render(<ChargerQrCode state={q.state()} connected onRefresh={() => {}} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('取得失敗');
  expect(q.state().content).toBe('');
});

test('timeout ignores late success, CALLERROR is a failure, and reset removes a valid QR', () => {
  const q = setup(); const expired = q.request();
  jest.advanceTimersByTime(QR_TIMEOUT_MS);
  expect(q.state().error).toContain('逾時');
  expect(q.reply(expired, { status: 'Accepted', data: 'LATE' })).toBe(false);
  const next = q.request();
  q.client.receive(JSON.stringify([4, next, 'NotSupported', 'no', {}]));
  expect(q.state().phase).toBe('error');
  q.reply(q.request(), { status: 'Accepted', data: 'VALID' });
  q.client.reset();
  expect(q.state()).toEqual(EMPTY_QR);
  expect(jest.getTimerCount()).toBe(0);
});

test('failed send and over-capacity content never leave a QR visible', () => {
  const q = setup();
  q.client.request(() => { throw new Error('offline'); });
  expect(q.state().phase).toBe('error');
  q.reply(q.request(), { status: 'Accepted', data: 'x'.repeat(10000) });
  expect(q.state().symbol).toBeNull();
  expect(q.state().error).toContain('編碼');
});

test('two stations cannot consume each other’s QR responses', () => {
  const first = setup(); const second = setup();
  const id1 = first.request(); const id2 = second.request();
  expect(id1).not.toBe(id2);
  expect(first.reply(id2, { status: 'Accepted', data: 'SECOND' })).toBe(false);
  first.reply(id1, { status: 'Accepted', data: 'FIRST' });
  second.reply(id2, { status: 'Accepted', data: 'SECOND' });
  expect(first.state().content).toBe('FIRST');
  expect(second.state().content).toBe('SECOND');
});
