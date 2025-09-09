import React, { useState, useRef, useEffect } from 'react';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Paper,
  Stack,
  CssBaseline,
  ThemeProvider,
  createTheme,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from '@mui/material';
import { useOcppStateMachine, OcppEvent } from './useOcppStateMachine';
import { OcppService } from './ocppService';
import { useWebSocket } from './useWebSocket';

const darkTheme = createTheme({
  palette: { mode: 'dark' },
});

// 自動根據協定切換 ws/wss
const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const defaultDomain = window.location.hostname;

// 主應用程式組件
function App() {
  // ===== 狀態管理 =====
  // 訊息輸入框內容
  const [message, setMessage] = useState('');
  // 日誌訊息陣列
  const [logs, setLogs] = useState<string[]>([]);
  // 充電設定
  const [amps, setAmps] = useState<number | ''>('');
  const [watts, setWatts] = useState<number | ''>('');
  const [profileId, setProfileId] = useState(1);
  // 心跳間隔
  const [heartbeatInterval, setHeartbeatInterval] = useState<number | null>(null);
  // 心跳計時器
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 充電樁可用狀態
  const [available, setAvailable] = useState(true);
  // 累積度數
  const [energy, setEnergy] = useState(0);
  // 交易 ID
  const [transactionId, setTransactionId] = useState<number | null>(1);
  // 從伺服器端接收的 idTag
  const [serverIdTag, setServerIdTag] = useState<string>('01');
  // MeterValues 計時器
  const meterTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 追蹤發送的 StopTransaction UID
  const stopTransactionUidRef = useRef<string | null>(null);

  // ===== WebSocket 連線設定 =====
  // domain 與協定選擇
  const [domain, setDomain] = useState(defaultDomain);
  const [wsProtocol, setWsProtocol] = useState<'ws' | 'wss'>(defaultWsProtocol);
  // CP 路徑選擇（改為 cpid）
  const [cpPath, setCpPath] = useState('48210B430236');
  // 組合完整 ws/wss URL，cpid 前補上 /ocpp
  const wsUrl = wsProtocol === 'wss'
    ? `wss://${domain}:443/ocpp/${cpPath}`
    : `ws://${domain}:8089/ocpp/${cpPath}`

  // const wsUrl = "wss://ocpp.evape.com.tw:443/ocpp/websocket/48210B430236"
  // const wsUrl = "ws://192.168.50.118:5255/ocpp/websocket/AWSC770001E2P1C2303A002A0"

  // 在 render 處加 log 觀察 cpPath 與 wsUrl
  console.log('cpPath in render:', cpPath, 'wsUrl:', wsUrl);

  // ===== 日誌紀錄 =====
  // 新增一筆日誌
  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // ===== OCPP 狀態機與 WebSocket hook 整合 =====
  // WebSocket 連線 hook，onMessage callback 處理所有訊息
  const {
    status,
    socketRef,
    connect,
    disconnect,
  } = useWebSocket(wsUrl, (event: MessageEvent) => {
    if (!event || typeof event !== 'object' || !('data' in event)) return;
    handleMessage(event);
  });
  // 用 ref 保存最新 status 狀態，避免閉包問題
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  // OCPP 狀態機
  const [ocppStatus, dispatchOcpp] = useOcppStateMachine('Available');
  // OCPP 信令服務
  const ocppService = new OcppService(socketRef, appendLog);

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
          ocppService.sendStatusNotification('Available');
        }
      }, 500);
      return;
    }
    
    // 處理 StartTransaction.conf（包含 transactionId）
    if (result.idTagInfo && result.transactionId !== undefined) {
      if (result.transactionId && result.idTagInfo.status === 'Accepted') {
        // 根據 OCPP 1.6 規範，StartTransaction.conf 必須包含 transactionId 和 idTagInfo
        const txId = result.transactionId;
        setTransactionId(txId);
        appendLog(`Received StartTransaction.conf with transactionId: ${txId}`);
        console.log(`Received StartTransaction.conf with transactionId: ${txId}`);
        // 收到 StartTransaction.conf 後送 StatusNotification(Charging)
        if (socketRef.current && socketRef.current.readyState === 1) {
          ocppService.sendStatusNotification('Charging');
          dispatchOcpp({ type: 'START_CHARGING' });
          // 啟動 MeterValues timer
          startMeterTimer(txId);
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
    let canStart = false;
    if (
      socketRef.current &&
      socketRef.current.readyState === 1 &&
      ocppStatus === 'Preparing'
    ) {
      canStart = true;
    }
    const response = [3, uid, { status: canStart ? 'Accepted' : 'Rejected' }];
    socketRef.current && socketRef.current.send(JSON.stringify(response));
    appendLog(`Received RemoteStartTransaction, 回應: ${canStart ? 'Accepted' : 'Rejected'}`);
    console.log(`Received RemoteStartTransaction, 回應: ${canStart ? 'Accepted' : 'Rejected'}`);

    if (canStart) {
      // 1. 先送 StartTransaction
      setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === 1) {
          const startTxPayload = {
            connectorId: 1,
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
    // 1. 回應 Accepted
    const response = [3, uid, { status: 'Accepted' }];
    socketRef.current && socketRef.current.send(JSON.stringify(response));
    appendLog('Received RemoteStopTransaction, 回應: Accepted');
    console.log('Received RemoteStopTransaction, 回應: Accepted');
    // 2. 送 StatusNotification(Finishing)
    setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === 1) {
        ocppService.sendStatusNotification('Finishing');
        dispatchOcpp({ type: 'REMOTE_STOP' });
      }
    }, 300);
    // 3. 送 StopTransaction
    setTimeout(() => {
      console.log(`transactionId: ${transactionId}`);
      if (socketRef.current && socketRef.current.readyState === 1 && transactionId) {
        const uid = `uid-${Date.now()}`;
        stopTransactionUidRef.current = uid;
        const payload = {
          transactionId,
          idTag: serverIdTag, // 使用伺服器端的 idTag
          meterStop: Math.round(energy),
          timestamp: new Date().toISOString(),
          reason: 'Remote'
        };
        const msg = JSON.stringify([2, uid, 'StopTransaction', payload]);
        socketRef.current.send(msg);
        appendLog(`Sent StopTransaction: ${msg}`);
      } else {
        appendLog(`Sent StopTransaction fail, transactionId: ${transactionId}`);
      }
    }, 800);
    // 4. 送 StatusNotification(Available)
    setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === 1) {
        ocppService.sendStatusNotification('Available');
        dispatchOcpp({ type: 'STOP_CHARGING' });
        setTransactionId(null);
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

    // 檢查 connectorId 是否有效（假設只支援 connector 0 和 1）
    if (payload.connectorId !== 0 && payload.connectorId !== 1) {
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
        appendLog(`Applied charging limit: ${currentPeriod.limit} ${unit}`);
        
        // 根據單位更新 UI 狀態
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
  };

  // ====== 其他輔助邏輯（計時器、UI 控制等） ======
  // 移除 setOnMessage 與相關 useEffect

  const sendMessage = () => {
    if (socketRef.current && status === 'CONNECTED') {
      socketRef.current.send(message);
      appendLog(`Sent: ${message}`);
      setMessage('');
    } else {
      appendLog('Cannot send message, socket not connected');
    }
  };

  const clearLogs = () => setLogs([]);

  const sendChargingProfile = () => {
    if (socketRef.current && status === 'CONNECTED') {
      let limit = 0;
      let unit = '';

      if (watts) {
        limit = watts;
        unit = 'W';
      } else if (amps) {
        limit = amps;
        unit = 'A';
      } else {
        appendLog('請輸入至少瓦數或安培');
        return;
      }

      const payload = {
        connectorId: 1,
        chargingProfile: {
          chargingProfileId: profileId,
          stackLevel: 0,
          chargingProfilePurpose: 'TxDefaultProfile',
          chargingProfileKind: 'Absolute',
          recurrencyKind: 'Daily',
          validFrom: new Date().toISOString(),
          chargingSchedule: {
            duration: 3600,
            chargingRateUnit: unit,
            chargingSchedulePeriod: [
              {
                startPeriod: 0,
                limit,
                numberPhases: 1,
              },
            ],
          },
        },
      };

      const ocppMessage = JSON.stringify([2, `uid-${Date.now()}`, 'SetChargingProfile', payload]);
      socketRef.current.send(ocppMessage);
      appendLog(`Sent SetChargingProfile: ${ocppMessage}`);
    } else {
      appendLog('無法送出，WebSocket 尚未連線');
    }
  };

  // BootNotification 發送函數
  const sendBootNotification = () => {
    console.log('sendBootNotification status:', statusRef.current);
    if (socketRef.current && statusRef.current === 'CONNECTED') {
      const payload = {
        chargePointVendor: 'DemoVendor',
        chargePointModel: 'DemoModel',
        chargePointSerialNumber: 'CP-123456',
        chargeBoxSerialNumber: 'CB-123456',
        firmwareVersion: '1.0.0',
        iccid: '',
        imsi: '',
        meterType: 'DemoMeter',
        meterSerialNumber: 'MTR-123456',
      };
      const ocppMessage = JSON.stringify([
        2,
        `uid-${Date.now()}`,
        'BootNotification',
        payload
      ]);
      socketRef.current.send(ocppMessage);
      appendLog(`Sent BootNotification: ${ocppMessage}`);
    } else {
      appendLog('無法送出 BootNotification，WebSocket 尚未連線');
    }
  };

  // Authorize 發送函數
  const sendAuthorize = () => {
    if (socketRef.current && statusRef.current === 'CONNECTED') {
      const payload = {
        idTag: serverIdTag || 'DEMO_IDTAG', // 使用伺服器端的 idTag 或預設值
      };
      const ocppMessage = JSON.stringify([
        2,
        `uid-${Date.now()}`,
        'Authorize',
        payload
      ]);
      socketRef.current.send(ocppMessage);
      appendLog(`Sent Authorize: ${ocppMessage}`);
    } else {
      appendLog('無法送出 Authorize，WebSocket 尚未連線');
    }
  };



  // Heartbeat 發送函數
  const sendHeartbeat = () => {
    console.log('Heartbeat timer tick', {
      status,
      socket: socketRef.current,
      readyState: socketRef.current?.readyState
    });
    if (socketRef.current && socketRef.current.readyState === 1) {
      const ocppMessage = JSON.stringify([
        2,
        `uid-${Date.now()}`,
        'Heartbeat',
        {}
      ]);
      socketRef.current.send(ocppMessage);
      appendLog(`Sent Heartbeat: ${ocppMessage}`);
      console.log(`Sent Heartbeat: ${ocppMessage}`);
    }
  };

  // 清除 heartbeat timer
  const clearHeartbeatTimer = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      console.log('Heartbeat timer cleared');
      heartbeatTimerRef.current = null;
    }
  };

  // 啟動 heartbeat timer
  const startHeartbeatTimer = (intervalSec: number) => {
    clearHeartbeatTimer();
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, intervalSec * 1000);
    console.log(`Heartbeat timer started, interval: ${intervalSec} 秒`);
  };

  // 清除 MeterValues timer
  const clearMeterTimer = () => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
      appendLog('MeterValues timer cleared');
      console.log('MeterValues timer cleared');
    }
  };

  // 啟動 MeterValues timer
  const startMeterTimer = (txId: number) => {
    clearMeterTimer();
    setEnergy(0);
    meterTimerRef.current = setInterval(() => {
      setEnergy(prev => {
        const next = prev + Math.random() * 2 + 0.5;
        if (socketRef.current && socketRef.current.readyState === 1) {
          const meterPayload = {
            connectorId: 1,
            transactionId: txId,
            meterValue: [
              {
                timestamp: new Date().toISOString(),
                sampledValue: [
                  { value: next.toFixed(2), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }
                ]
              }
            ]
          };
          const ocppMeterMsg = JSON.stringify([
            2,
            `uid-${Date.now()}`,
            'MeterValues',
            meterPayload
          ]);
          socketRef.current.send(ocppMeterMsg);
          appendLog(`Sent MeterValues: ${ocppMeterMsg}`);
          console.log(`Sent MeterValues: ${ocppMeterMsg}`);
        }
        return next;
      });
    }, 10000);
    appendLog('MeterValues timer started');
    console.log('MeterValues timer started');
  };

  // 監聽 status 變化，斷線時清除 heartbeat timer
  useEffect(() => {
    if (status !== 'CONNECTED') {
      clearHeartbeatTimer();
    }
  }, [status]);



  // 插槍（Preparing）按鈕處理
  const handlePlugIn = () => {
    if (socketRef.current && socketRef.current.readyState === 1) {
      ocppService.sendStatusNotification('Preparing');
      dispatchOcpp({ type: 'PLUG_IN' });
    }
  };

  // 拔槍（Unplug）按鈕處理
  const handleUnplug = () => {
    if (!(socketRef.current && socketRef.current.readyState === 1)) return;
    if (ocppStatus === 'Charging') {
      // 1. StatusNotification(Finishing)
      ocppService.sendStatusNotification('Finishing');
      dispatchOcpp({ type: 'UNPLUG' });
              // 2. StopTransaction（延遲 300ms）
        setTimeout(() => {
          if (transactionId && socketRef.current && socketRef.current.readyState === 1) {
            const uid = `uid-${Date.now()}`;
            stopTransactionUidRef.current = uid;
            const payload = {
              transactionId,
              idTag: serverIdTag || 'DEMO_IDTAG', // 如果沒有伺服器端 idTag 則使用預設值
              meterStop: Math.round(energy),
              timestamp: new Date().toISOString(),
              reason: 'EVDisconnected'
            };
            const msg = JSON.stringify([2, uid, 'StopTransaction', payload]);
            socketRef.current.send(msg);
            appendLog(`Sent StopTransaction: ${msg}`);
          }
          // 3. StatusNotification(Available)（再延遲 300ms）
          setTimeout(() => {
            ocppService.sendStatusNotification('Available');
            dispatchOcpp({ type: 'STOP_CHARGING' });
            setEnergy(0);
            setTransactionId(null);
            setServerIdTag(''); // 清除伺服器端 idTag
          }, 300);
        }, 300);
    } else {
      // 非 Charging 狀態，僅送 Available
      ocppService.sendStatusNotification('Available');
      dispatchOcpp({ type: 'UNPLUG' });
      setEnergy(0);
      setTransactionId(null);
      setServerIdTag(''); // 清除伺服器端 idTag
    }
  };

  return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Paper elevation={3} sx={{ p: 4 }}>
            <Typography variant="h4" gutterBottom>
              CP 測試頁面
            </Typography>

            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              狀態：
              <strong style={{ color: status === 'CONNECTED' ? 'lightgreen' : status === 'CONNECTING' ? 'orange' : 'tomato' }}>
                {status}
              </strong>
              {/* 累積度數顯示在狀態右側 */}
              <span style={{ marginLeft: 24, fontWeight: 500, color: '#90caf9', fontSize: 18 }}>
                累積度數：{energy.toFixed(2)} Wh
              </span>
              {/* 伺服器端 idTag 顯示 */}
              {serverIdTag && (
                <span style={{ marginLeft: 24, fontWeight: 500, color: '#ffb74d', fontSize: 18 }}>
                  伺服器 idTag：{serverIdTag}
                </span>
              )}
            </Typography>

            {/* WebSocket URL & Connect/Disconnect */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <FormControl sx={{ minWidth: 100 }}>
                <InputLabel id="ws-protocol-label">協定</InputLabel>
                <Select
                  labelId="ws-protocol-label"
                  value={wsProtocol}
                  label="協定"
                  onChange={(e) => setWsProtocol(e.target.value as 'ws' | 'wss')}
                >
                  <MenuItem value="ws">ws</MenuItem>
                  <MenuItem value="wss">wss</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Domain"
                variant="outlined"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="your-domain.com"
              />
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel id="cp-path-label">CPID</InputLabel>
                <Select
                  labelId="cp-path-label"
                  value={cpPath}
                  label="CPID"
                  onChange={(e) => {
                    console.log('cpid changed:', e.target.value);
                    setCpPath(e.target.value as string);
                    if (status === 'CONNECTED') {
                      disconnect();
                    }
                  }}
                >
                  <MenuItem value="48210B430236">48210B430236</MenuItem>
                  <MenuItem value="AWSC770001E2P1C2303A002A0">AWSC770001E2P1C2303A002A0</MenuItem>
                  <MenuItem value="TACW1942922P7527">TACW1942922P7527</MenuItem>
                  <MenuItem value="CP001">CP001</MenuItem>
                  <MenuItem value="CP002">CP002</MenuItem>
                  <MenuItem value="CP003">CP003</MenuItem>
                </Select>
              </FormControl>
              <Button variant="contained" color="success" onClick={connect} disabled={status !== 'DISCONNECTED'}>
                Connect
              </Button>
              <Button variant="outlined" color="error" onClick={disconnect} disabled={status !== 'CONNECTED'}>
                Disconnect
              </Button>
            </Stack>
            <Typography variant="body2" sx={{ mb: 2, color: '#888' }}>
              連線網址：{wsUrl}
            </Typography>

            {/* BootNotification 與插槍按鈕橫向排列 */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Button variant="contained" color="primary" onClick={sendBootNotification} disabled={status !== 'CONNECTED'}>
                BootNotification
              </Button>
              <Button variant="contained" color="secondary" onClick={sendAuthorize} disabled={status !== 'CONNECTED'}>
                Authorize
              </Button>
              <Button variant="contained" color="info" onClick={handlePlugIn} disabled={ocppStatus !== 'Available' || !(socketRef.current && socketRef.current.readyState === 1)}>
                插槍（Preparing）
              </Button>
              <Button variant="contained" color="warning" onClick={handleUnplug} disabled={ocppStatus === 'Available'}>
                拔槍（Unplug）
              </Button>
            </Stack>

            {/* SetChargingProfile 輸入區 */}
            <Stack spacing={2} sx={{ mb: 2 }}>
              <Typography variant="subtitle1">SetChargingProfile 設定</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                    label="瓦數 (W)"
                    type="number"
                    value={watts}
                    onChange={(e) => setWatts(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <TextField
                    label="安培 (A)"
                    type="number"
                    value={amps}
                    onChange={(e) => setAmps(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <TextField
                    label="ChargingProfileId"
                    type="number"
                    value={profileId}
                    onChange={(e) => setProfileId(Number(e.target.value))}
                />
                <Button variant="contained" onClick={sendChargingProfile}>
                  發送 ChargingProfile
                </Button>
              </Stack>
            </Stack>

            {/* Logs */}
            <Box sx={{ mb: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">Logs</Typography>
                <Button variant="text" onClick={clearLogs} color="secondary">
                  Clear
                </Button>
              </Stack>
              <Paper variant="outlined" sx={{ mt: 1, maxHeight: 300, overflowY: 'auto', p: 2 }}>
                {logs.map((log, index) => (
                    <Typography variant="body2" key={index} sx={{ whiteSpace: 'pre-line' }}>
                      {log}
                    </Typography>
                ))}
              </Paper>
            </Box>
          </Paper>
        </Container>
      </ThemeProvider>
  );
}

export default App;
