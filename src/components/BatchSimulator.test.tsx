import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { BatchSimulator } from './BatchSimulator';

test('applying the default 50 and then 100 stations is offline and shows the generated CPIDs', () => {
  const socket = jest.spyOn(window, 'WebSocket');
  const { unmount } = render(<BatchSimulator onActiveChange={() => {}} />);
  const authorizationSwitch = screen.getByRole('checkbox', { name: /AuthorizeRemoteTxRequests/ });
  expect(authorizationSwitch).not.toBeChecked();
  fireEvent.click(authorizationSwitch);
  expect(authorizationSwitch).toBeChecked();
  expect(screen.getByText('AuthorizeRemoteTxRequests：true')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '全部連線並註冊' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '套用台數與設定' }));
  expect(screen.getByText('TESTAC001')).toBeInTheDocument();
  expect(screen.getByText('TESTAC050')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(51);
  expect(screen.getByRole('button', { name: '全部連線並註冊' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '100 台 AC 單槍' }));
  fireEvent.click(screen.getByRole('button', { name: '套用台數與設定' }));
  expect(screen.getByText('TESTAC100')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(101);
  expect(socket).not.toHaveBeenCalled();
  unmount();
  socket.mockRestore();
});
