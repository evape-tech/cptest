// ocppService.ts
// OcppService 專責發送 OCPP 1.6 信令（StatusNotification、StopTransaction 等），與 WebSocket 解耦
// 用法：
//   const service = new OcppService(socketRef, appendLog)
//   service.sendStatusNotification('Available')
//   service.sendStopTransaction(1001, 123.45)

export class OcppService {
  // WebSocket 實例 ref
  private socketRef: React.MutableRefObject<WebSocket | null>;
  // 日誌記錄函數
  private appendLog: ((msg: string) => void) | undefined;

  /**
   * 建構子
   * @param socketRef - WebSocket 實例 ref
   * @param appendLog - 日誌記錄函數（可選）
   */
  constructor(socketRef: React.MutableRefObject<WebSocket | null>, appendLog?: (msg: string) => void) {
    this.socketRef = socketRef;
    this.appendLog = appendLog;
  }

  /**
   * 發送 StatusNotification 信令
   * @param status - OCPP 狀態字串（如 'Available', 'Charging' 等）
   * @param connectorId - 連接器編號，預設 1
   */
  sendStatusNotification(status: string, connectorId: number = 1) {
    const payload = {
      connectorId,
      status,
      errorCode: 'NoError',
      info: '',
      timestamp: new Date().toISOString(),
      vendorId: '',
      vendorErrorCode: ''
    };
    const msg = JSON.stringify([
      2,
      `uid-${Date.now()}`,
      'StatusNotification',
      payload
    ]);
    this.socketRef.current && this.socketRef.current.send(msg);
    this.appendLog && this.appendLog(`Sent StatusNotification(${status}): ${msg}`);
  }

  /**
   * 發送 StopTransaction 信令
   * @param transactionId - 交易 ID
   * @param meterStop - 結束時累積度數
   * @param idTag - 標籤，預設 'DEMO_IDTAG'
   * @param reason - 結束原因，預設 'EVDisconnected'
   */
  sendStopTransaction(transactionId: number, meterStop: number, idTag: string = 'DEMO_IDTAG', reason: string = 'EVDisconnected') {
    const payload = {
      transactionId,
      idTag,
      meterStop: Math.round(meterStop),
      timestamp: new Date().toISOString(),
      reason
    };
    const msg = JSON.stringify([
      2,
      `uid-${Date.now()}`,
      'StopTransaction',
      payload
    ]);
    this.socketRef.current && this.socketRef.current.send(msg);
    this.appendLog && this.appendLog(`Sent StopTransaction: ${msg}`);
  }
} 