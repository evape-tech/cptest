import { useCallback, useEffect, useState } from 'react';
import { EMPTY_QR, QrCodeRequest, QrState } from '../qrCode';
import { WebSocketStatus } from '../useWebSocket';

export function useQrCode(socketRef: React.MutableRefObject<WebSocket | null>, status: WebSocketStatus) {
  const [state, setState] = useState<QrState>({ ...EMPTY_QR });
  const [client] = useState(() => new QrCodeRequest(setState));
  const refreshQr = useCallback(() => {
    const socket = socketRef.current;
    client.request(message => {
      if (!socket || socket.readyState !== 1) throw new Error('OCPP 尚未連線');
      socket.send(JSON.stringify(message));
    });
  }, [client, socketRef]);

  useEffect(() => {
    if (status === 'CONNECTED') refreshQr();
    else client.reset();
    return () => client.reset();
  }, [status, client, refreshQr]);

  const handleQrMessage = useCallback((raw: string) => client.receive(raw), [client]);
  return { qrState: status === 'CONNECTED' ? state : EMPTY_QR, refreshQr, handleQrMessage };
}
