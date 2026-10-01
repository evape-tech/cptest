import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('single-station screen fetches QR automatically, refreshes raw content, and hides it on failure', () => {
  const socket = {
    readyState: 0,
    onopen: null as null | (() => void),
    onmessage: null as null | ((event: { data: string }) => void),
    onclose: null as null | (() => void),
    onerror: null,
    send: jest.fn(),
    close: jest.fn(),
  };
  const constructor = jest.spyOn(window, 'WebSocket').mockImplementation(() => socket as unknown as WebSocket);
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const view = render(<App />);
  expect(screen.getByRole('button', { name: '重新取得 QR Code' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /^🔗 連線$/ }));
  act(() => { socket.readyState = 1; socket.onopen?.(); });
  const calls = () => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
  const first = calls().find(message => message[2] === 'DataTransfer');
  expect(first[3]).toEqual({ vendorId: 'efaner', messageId: 'GetQrCode' });
  act(() => { socket.onmessage?.({ data: JSON.stringify([3, first[1], { status: 'Accepted', data: 'CP00501' }]) }); });
  expect(screen.getByTestId('qr-content').textContent).toBe('CP00501');
  expect(screen.getByRole('img', { name: '後台回傳內容的 QR Code' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新取得 QR Code' }));
  expect(screen.queryByRole('img', { name: '後台回傳內容的 QR Code' })).not.toBeInTheDocument();
  const second = calls().filter(message => message[2] === 'DataTransfer')[1];
  expect(second[1]).not.toBe(first[1]);
  act(() => { socket.onmessage?.({ data: JSON.stringify([3, second[1], { status: 'Rejected', data: 'CP00501' }]) }); });
  expect(screen.getByText(/取得失敗/)).toBeInTheDocument();
  expect(screen.queryByTestId('qr-content')).not.toBeInTheDocument();
  view.unmount();
  constructor.mockRestore();
  consoleLog.mockRestore();
});
