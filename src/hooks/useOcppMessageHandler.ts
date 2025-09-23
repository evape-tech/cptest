import { useRef } from 'react';
import { OcppService } from '../ocppService';

interface UseOcppMessageHandlerProps {
  socketRef: React.MutableRefObject<WebSocket | null>;
  appendLog: (msg: string) => void;
  chargerType: 'AC' | 'DC';
  connectorId: number;
  ocppService: OcppService;
  setHeartbeatInterval: (interval: number) => void;
  startHeartbeatTimer: (interval: number) => void;
  setServerIdTag: (tag: string) => void;
  setConnector1TransactionId: (id: number | null) => void;
  setConnector2TransactionId: (id: number | null) => void;
  setConnector1Status: (status: 'Available' | 'Preparing' | 'Charging' | 'Finishing') => void;
  setConnector2Status: (status: 'Available' | 'Preparing' | 'Charging' | 'Finishing') => void;
  setTransactionId: (id: number | null) => void;
  dispatchOcpp: (action: any) => void;
  startMeterTimer: (txId: number, connectorId: number) => void;
  clearMeterTimer: () => void;
  transactionId: number | null;
  energy: number;
  serverIdTag: string;
  // DC 充電樁各連接器的狀態
  connector1TransactionId: number | null;
  connector2TransactionId: number | null;
  connector1Energy: number;
  connector2Energy: number;
  // 當前選中連接器的設定 (保持向後兼容)
  setWatts: (value: number | '') => void;
  setAmps: (value: number | '') => void;
  setProfileId: (value: number) => void;
  // 各連接器獨立的功率限制設定
  setConnector1Watts: (value: number | '') => void;
  setConnector1Amps: (value: number | '') => void;
  setConnector1ProfileId: (value: number) => void;
  setConnector2Watts: (value: number | '') => void;
  setConnector2Amps: (value: number | '') => void;
  setConnector2ProfileId: (value: number) => void;
}

export const useOcppMessageHandler = ({
  socketRef,
  appendLog,
  chargerType,
  connectorId,
  ocppService,
  setHeartbeatInterval,
  startHeartbeatTimer,
  setServerIdTag,
  setConnector1TransactionId,
  setConnector2TransactionId,
  setConnector1Status,
  setConnector2Status,
  setTransactionId,
  dispatchOcpp,
  startMeterTimer,
  clearMeterTimer,
  transactionId,
  energy,
  serverIdTag,
  connector1TransactionId,
  connector2TransactionId,
  connector1Energy,
  connector2Energy,
  setWatts,
  setAmps,
  setProfileId,
  setConnector1Watts,
  setConnector1Amps,
  setConnector1ProfileId,
  setConnector2Watts,
  setConnector2Amps,
  setConnector2ProfileId,
}: UseOcppMessageHandlerProps) => {
  // 跟踪當前正在處理的StartTransaction的connectorId
  const pendingStartTransactionConnectorRef = useRef<number | null>(null);
  const stopTransactionUidRef = useRef<string | null>(null);

  // 處理 CALL 請求訊息
  const handleCall = (data: any[]) => {
    const uid = data[1];
    const action = data[2];
    const payload = data[3];
    
    switch (action) {
      case 'RemoteStartTransaction':
        handleRemoteStartTransaction(uid, payload);
        break;
      case 'RemoteStopTransaction':
        handleRemoteStopTransaction(uid, payload);
        break;
      case 'SetChargingProfile':
        handleSetChargingProfile(uid, payload);
        break;
      default:
        appendLog(`Unhandled action: ${action}`);
        break;
    }
  };

  // 處理所有 WebSocket 收到的訊息
  const handleMessage = (event: MessageEvent) => {
    appendLog(`Received: ${event.data}`);
    console.log(`Received: ${event.data}`);
    try {
      const data = JSON.parse(event.data);
      
      // 根據訊息類型分發處理
      if (Array.isArray(data)) {
        if (data.length === 3 && data[2] && typeof data[2] === 'object') {
          // 處理回應訊息 (CALLRESULT)
          handleCallResult(data);
        } else if (data.length === 4 && typeof data[2] === 'string') {
          // 處理請求訊息 (CALL)
          handleCall(data);
        }
      }
    } catch (e) {
      // ignore parse error
    }
  };

  // 處理 CALLRESULT 回應訊息
  const handleCallResult = (data: any[]) => {
    const uid = data[1];
    const result = data[2];
    
    // 處理 BootNotification.conf
    if (result.status === 'Accepted' && (result.interval || result.heartbeatInterval)) {
      const interval = typeof result.heartbeatInterval === 'number' ? result.heartbeatInterval : result.interval;
      setHeartbeatInterval(interval);
      startHeartbeatTimer(interval);
      appendLog(`Set heartbeat interval: ${interval} 秒`);
      // 500ms 後自動發送 StatusNotification(Available)
      setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === 1) {
          if (chargerType === 'DC') {
            // DC 充電樁發送兩個 Connector 的狀態
            ocppService.sendStatusNotification('Available', 1);
            setTimeout(() => {
              ocppService.sendStatusNotification('Available', 2);
            }, 100);
          } else {
            // AC 充電樁只發送 Connector 1
            ocppService.sendStatusNotification('Available', 1);
          }
        }
      }, 500);
      return;
    }
    
    // 處理 StartTransaction.conf（包含 transactionId）
    if (result.idTagInfo && result.transactionId !== undefined) {
      if (result.transactionId && result.idTagInfo.status === 'Accepted') {
        // 根據 OCPP 1.6 規範，StartTransaction.conf 必須包含 transactionId 和 idTagInfo
        const txId = result.transactionId;
        
        // 根據充電樁類型更新對應的狀態
        if (chargerType === 'DC') {
          // 對於 DC 充電樁，使用記錄的connectorId來更新對應的狀態
          const targetConnectorId = pendingStartTransactionConnectorRef.current || connectorId;
          if (targetConnectorId === 1) {
            setConnector1TransactionId(txId);
            setConnector1Status('Charging');
          } else if (targetConnectorId === 2) {
            setConnector2TransactionId(txId);
            setConnector2Status('Charging');
          }
          appendLog(`Received StartTransaction.conf C${targetConnectorId} with transactionId: ${txId}`);
        } else {
          // AC 充電樁使用原有邏輯
          setTransactionId(txId);
          appendLog(`Received StartTransaction.conf with transactionId: ${txId}`);
          dispatchOcpp({ type: 'START_CHARGING' });
        }
        
        console.log(`Received StartTransaction.conf with transactionId: ${txId}`);
        
        // 收到 StartTransaction.conf 後送 StatusNotification(Charging)
        if (socketRef.current && socketRef.current.readyState === 1) {
          const targetConnectorId = pendingStartTransactionConnectorRef.current || connectorId;
          ocppService.sendStatusNotification('Charging', targetConnectorId);
          // 啟動對應的 MeterValues timer
          startMeterTimer(txId, targetConnectorId);
          // 清除記錄
          pendingStartTransactionConnectorRef.current = null;
        }
        return;
      } else {
        appendLog(`StartTransaction 被拒絕，原因: ${result.idTagInfo.status}`);
        console.log(`StartTransaction rejected, status: ${result.idTagInfo.status}`);
        // 可視需要在這裡重置 UI 狀態
        return;
      }
    }
    
    // 處理 Authorize.conf（只有 idTagInfo，沒有 transactionId）
    if (result.idTagInfo && result.transactionId === undefined) {
      appendLog(`Received Authorize.conf, status: ${result.idTagInfo.status}`);
      console.log(`Received Authorize.conf, status: ${result.idTagInfo.status}`);
      return;
    }
    
    // 處理 StopTransaction.conf
    if (stopTransactionUidRef.current === uid && result.idTagInfo) {
      // 根據 OCPP 1.6 規範，StopTransaction.conf 必須包含 idTagInfo
      if (result.idTagInfo.status === 'Accepted') {
        // 收到 StopTransaction.conf 的 Accepted 回應後，清除 MeterValues timer
        appendLog('Received StopTransaction.conf Accepted, clearing MeterValues timer...');
        console.log('Received StopTransaction.conf Accepted, clearing MeterValues timer...');
        clearMeterTimer();
        stopTransactionUidRef.current = null; // 清除 UID 追蹤
        return;
      }
    }
  };

  // 處理 RemoteStartTransaction 請求
  const handleRemoteStartTransaction = (uid: string, payload: any) => {
    // 驗證 idTag 是否存在
    if (!payload.idTag) {
      const response = [3, uid, { status: 'Rejected' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog('Received RemoteStartTransaction without idTag, 回應: Rejected');
      console.log('Received RemoteStartTransaction without idTag, 回應: Rejected');
      return;
    }
    
    // 儲存從伺服器端接收的 idTag
    setServerIdTag(payload.idTag);
    appendLog(`Received idTag from server: ${payload.idTag}`);
    
    // 只有在 Preparing 狀態才允許
    // Note: This logic might need adjustment based on your current state management
    let canStart = false;
    if (socketRef.current && socketRef.current.readyState === 1) {
      canStart = true; // Simplified for now
    }
    const response = [3, uid, { status: canStart ? 'Accepted' : 'Rejected' }];
    socketRef.current && socketRef.current.send(JSON.stringify(response));
    appendLog(`Received RemoteStartTransaction, 回應: ${canStart ? 'Accepted' : 'Rejected'}`);
    console.log(`Received RemoteStartTransaction, 回應: ${canStart ? 'Accepted' : 'Rejected'}`);

    if (canStart) {
      // 對於RemoteStartTransaction，優先使用請求中指定的connectorId
      // 如果沒有指定，則使用當前UI選中的connectorId（對於DC充電樁）或預設為1（對於AC充電樁）
      const targetConnectorId = payload.connectorId || (chargerType === 'DC' ? connectorId : 1);
      pendingStartTransactionConnectorRef.current = targetConnectorId;
      
      // 1. 先送 StartTransaction
      setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === 1) {
          const startTxPayload = {
            connectorId: targetConnectorId,
            idTag: payload.idTag, // 直接使用 payload.idTag，避免狀態更新延遲
            meterStart: 0,
            timestamp: new Date().toISOString()
          };
          const ocppStartTxMsg = JSON.stringify([
            2,
            `uid-${Date.now()}`,
            'StartTransaction',
            startTxPayload
          ]);
          socketRef.current.send(ocppStartTxMsg);
          appendLog(`Sent StartTransaction: ${ocppStartTxMsg}`);
          console.log(`Sent StartTransaction: ${ocppStartTxMsg}`);
          // 等待 S 端回應 StartTransaction.conf 後再進入 Charging 狀態
        }
      }, 300);
    }
  };

  // 處理 RemoteStopTransaction 請求
  const handleRemoteStopTransaction = (uid: string, payload: any) => {
    // 確定目標連接器ID
    const targetConnectorId = payload.connectorId || connectorId;
    
    // 1. 回應 Accepted
    const response = [3, uid, { status: 'Accepted' }];
    socketRef.current && socketRef.current.send(JSON.stringify(response));
    appendLog('Received RemoteStopTransaction, 回應: Accepted');
    console.log('Received RemoteStopTransaction, 回應: Accepted');
    
    // 2. 送 StatusNotification(Finishing)
    setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === 1) {
        ocppService.sendStatusNotification('Finishing', targetConnectorId);
        if (chargerType === 'DC') {
          if (targetConnectorId === 1) {
            setConnector1Status('Finishing');
          } else if (targetConnectorId === 2) {
            setConnector2Status('Finishing');
          }
        } else {
          dispatchOcpp({ type: 'REMOTE_STOP' });
        }
      }
    }, 300);
    
    // 3. 送 StopTransaction
    setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === 1) {
        // 根據連接器ID獲取對應的transactionId和energy
        let currentTransactionId: number | null = null;
        let currentEnergy = 0;
        
        if (chargerType === 'DC') {
          if (targetConnectorId === 1) {
            currentTransactionId = connector1TransactionId;
            currentEnergy = connector1Energy;
          } else if (targetConnectorId === 2) {
            currentTransactionId = connector2TransactionId;
            currentEnergy = connector2Energy;
          }
        } else {
          currentTransactionId = transactionId;
          currentEnergy = energy;
        }
        
        if (currentTransactionId) {
          const stopUid = `uid-${Date.now()}`;
          stopTransactionUidRef.current = stopUid;
          const stopPayload = {
            transactionId: currentTransactionId,
            idTag: serverIdTag, // 使用伺服器端的 idTag
            meterStop: Math.round(currentEnergy),
            timestamp: new Date().toISOString(),
            reason: 'Remote'
          };
          const msg = JSON.stringify([2, stopUid, 'StopTransaction', stopPayload]);
          socketRef.current.send(msg);
          appendLog(`Sent StopTransaction C${targetConnectorId}: ${msg}`);
        } else {
          appendLog(`Sent StopTransaction fail, transactionId: ${currentTransactionId} for C${targetConnectorId}`);
        }
      }
    }, 800);
    
    // 4. 送 StatusNotification(Available)
    setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === 1) {
        ocppService.sendStatusNotification('Available', targetConnectorId);
        if (chargerType === 'DC') {
          if (targetConnectorId === 1) {
            setConnector1Status('Available');
            setConnector1TransactionId(null);
          } else if (targetConnectorId === 2) {
            setConnector2Status('Available');
            setConnector2TransactionId(null);
          }
        } else {
          dispatchOcpp({ type: 'STOP_CHARGING' });
          setTransactionId(null);
        }
      }
    }, 1300);
  };

  // 處理 SetChargingProfile 請求
  const handleSetChargingProfile = (uid: string, payload: any) => {
    appendLog(`Received SetChargingProfile: ${JSON.stringify(payload)}`);
    console.log(`Received SetChargingProfile: ${JSON.stringify(payload)}`);

    // 支援 csChargingProfiles 為物件或陣列
    let profiles = payload.csChargingProfiles;
    if (!profiles) {
      const response = [3, uid, { status: 'Rejected' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog('SetChargingProfile missing required fields, 回應: Rejected');
      return;
    }
    if (!Array.isArray(profiles)) {
      profiles = [profiles];
    }

    // 驗證必要的欄位
    if (typeof payload.connectorId !== 'number' || !profiles.length) {
      const response = [3, uid, { status: 'Rejected' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog('SetChargingProfile missing required fields, 回應: Rejected');
      return;
    }

    const profile = profiles[0];
    if (!profile.chargingProfileId ||
        !profile.chargingProfilePurpose ||
        !profile.chargingProfileKind ||
        !profile.chargingSchedule) {
      const response = [3, uid, { status: 'Rejected' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog('SetChargingProfile invalid chargingProfile structure, 回應: Rejected');
      return;
    }

    // 檢查 connectorId 是否有效
    const maxConnectorId = chargerType === 'DC' ? 2 : 1;
    if (payload.connectorId < 0 || payload.connectorId > maxConnectorId) {
      const response = [3, uid, { status: 'Rejected' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog(`SetChargingProfile invalid connectorId: ${payload.connectorId}, 回應: Rejected`);
      return;
    }
    
    // 檢查是否支援該 chargingProfilePurpose
    const supportedPurposes = ['ChargePointMaxProfile', 'TxDefaultProfile', 'TxProfile'];
    if (!supportedPurposes.includes(profile.chargingProfilePurpose)) {
      const response = [3, uid, { status: 'NotSupported' }];
      socketRef.current && socketRef.current.send(JSON.stringify(response));
      appendLog(`SetChargingProfile unsupported purpose: ${profile.chargingProfilePurpose}, 回應: NotSupported`);
      return;
    }
    
    // 如果是 TxProfile，檢查是否有有效的 transactionId
    if (profile.chargingProfilePurpose === 'TxProfile') {
      if (!transactionId) {
        const response = [3, uid, { status: 'Rejected' }];
        socketRef.current && socketRef.current.send(JSON.stringify(response));
        appendLog('SetChargingProfile TxProfile without active transaction, 回應: Rejected');
        return;
      }
    }
    
    // 驗證通過，接受 ChargingProfile
    const response = [3, uid, { status: 'Accepted' }];
    socketRef.current && socketRef.current.send(JSON.stringify(response));
    appendLog(`SetChargingProfile accepted for connector ${payload.connectorId}, profileId: ${profile.chargingProfileId}`);
    console.log(`SetChargingProfile accepted for connector ${payload.connectorId}, profileId: ${profile.chargingProfileId}`);
    
    // 這裡可以根據需要更新 UI 狀態或處理充電限制
    // 例如：更新當前的功率限制、安培限制等
    if (profile.chargingSchedule && profile.chargingSchedule.chargingSchedulePeriod) {
      const periods = profile.chargingSchedule.chargingSchedulePeriod;
      const currentPeriod = periods[0]; // 簡化處理，取第一個週期
      if (currentPeriod && currentPeriod.limit) {
        const unit = profile.chargingSchedule.chargingRateUnit;
        const targetConnectorId = payload.connectorId;
        appendLog(`Applied charging limit: ${currentPeriod.limit} ${unit} to connector ${targetConnectorId}`);
        
        // 根據連接器ID和單位更新對應的狀態
        if (targetConnectorId === 1) {
          if (unit === 'W') {
            setConnector1Watts(currentPeriod.limit);
            setConnector1Amps('');
          } else if (unit === 'A') {
            setConnector1Amps(currentPeriod.limit);
            setConnector1Watts('');
          }
          setConnector1ProfileId(profile.chargingProfileId);
        } else if (targetConnectorId === 2) {
          if (unit === 'W') {
            setConnector2Watts(currentPeriod.limit);
            setConnector2Amps('');
          } else if (unit === 'A') {
            setConnector2Amps(currentPeriod.limit);
            setConnector2Watts('');
          }
          setConnector2ProfileId(profile.chargingProfileId);
        }
        
        // 同時更新當前選中連接器的狀態 (保持向後兼容)
        if (targetConnectorId === connectorId) {
          if (unit === 'W') {
            setWatts(currentPeriod.limit);
            setAmps('');
          } else if (unit === 'A') {
            setAmps(currentPeriod.limit);
            setWatts('');
          }
          setProfileId(profile.chargingProfileId);
        }
      }
    }
  };

  return {
    handleMessage,
    stopTransactionUidRef,
  };
};
