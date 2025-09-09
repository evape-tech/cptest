// useWebSocket.ts
// 專責管理 WebSocket 連線、斷線、狀態與訊息事件的 React hook
// 參數:
//   initialUrl: 預設連線網址（不會自動連線）
//   onMessage: 收到訊息時的 callback (MessageEvent)
// 回傳:
//   status: 連線狀態（DISCONNECTED, CONNECTED, CONNECTING）
//   socketRef: WebSocket 實例 ref
//   url, setUrl: 目前網址與設定方法
//   connect, disconnect: 連線與斷線方法

import { useRef, useState, useCallback, useEffect } from 'react';

export type WebSocketStatus = 'DISCONNECTED' | 'CONNECTED' | 'CONNECTING';

export function useWebSocket(url: string, onMessage?: (event: MessageEvent) => void) {
  // 連線狀態
  const [status, setStatus] = useState<WebSocketStatus>('DISCONNECTED');
  // WebSocket 實例
  const socketRef = useRef<WebSocket | null>(null);

  // 建立 WebSocket 連線
  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close(); // 關閉舊的 WebSocket 實例，確保只有一個
    }
    setStatus('CONNECTING');
    // 建立 WebSocket 連線時帶上 OCPP 1.6 協定
    const socket = new WebSocket(url, 'ocpp1.6');
    socketRef.current = socket;
    socket.onopen = () => {
      setStatus('CONNECTED');
      console.log(`[WebSocket] onopen: 連線已建立，狀態設為 CONNECTED，網址: ${url}`);
    };
    // 收到訊息時呼叫 onMessage callback
    socket.onmessage = (event: MessageEvent) => {
      console.log('[WebSocket] onmessage: 收到訊息', event.data);
      if (onMessage) onMessage(event);
    };
    socket.onerror = (err) => {
      setStatus('DISCONNECTED');
      console.log('[WebSocket] onerror: 連線錯誤', err);
    };
    socket.onclose = (event) => {
      setStatus('DISCONNECTED');
      console.log('[WebSocket] onclose: 連線關閉', event);
    };
  }, [url, onMessage]);

  // 斷線
  const disconnect = useCallback(() => {
    if (socketRef.current && status === 'CONNECTED') {
      socketRef.current.close();
    }
  }, [status]);

  // 若 onMessage 變動，重新設置 handler
  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.onmessage = (event: MessageEvent) => {
        console.log('[WebSocket] receive:', event.data);
        if (onMessage) onMessage(event);
      };
    }
  }, [onMessage]);

  return {
    status,
    socketRef,
    connect,
    disconnect,
  };
} 