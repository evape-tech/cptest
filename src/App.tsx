import React, { useState, useRef, useEffect } from 'react';
import {
  Container,
  Stack,
  CssBaseline,
  ThemeProvider,
  Box,
  Button,
} from '@mui/material';
import { BatchSimulator } from './components/BatchSimulator';
import { ChargerQrCode } from './components/ChargerQrCode';
import { useQrCode } from './hooks/useQrCode';
import { useOcppStateMachine } from './useOcppStateMachine';
import { OcppService } from './ocppService';
import { useWebSocket } from './useWebSocket';
import { useOcppMessageHandler } from './hooks/useOcppMessageHandler';
import { darkTheme } from './theme';
import {
  HeaderSection,
  ConnectionSettings,
  ChargerStatus,
  OcppOperations,
  PowerLimitDisplay,
  SystemLogs,
} from './components';

// 主應用程式組件
function App() {
  const [testMode, setTestMode] = useState<'single' | 'batch'>('single');
  const [batchActive, setBatchActive] = useState(false);
  const [authorizeRemoteTxRequests, setAuthorizeRemoteTxRequests] = useState(false);
  // ===== 狀態管理 =====
  // 日誌訊息陣列
  const [logs, setLogs] = useState<string[]>([]);
  // 充電設定 (當前選中連接器的設定)
  const [amps, setAmps] = useState<number | ''>('');
  const [watts, setWatts] = useState<number | ''>('');
  const [profileId, setProfileId] = useState(1);
  
  // 各連接器獨立的功率限制設定
  const [connector1Watts, setConnector1Watts] = useState<number | ''>('');
  const [connector1Amps, setConnector1Amps] = useState<number | ''>('');
  const [connector1ProfileId, setConnector1ProfileId] = useState(0);
  const [connector2Watts, setConnector2Watts] = useState<number | ''>('');
  const [connector2Amps, setConnector2Amps] = useState<number | ''>('');
  const [connector2ProfileId, setConnector2ProfileId] = useState(0);
  
  // Connector ID
  const [connectorId, setConnectorId] = useState(1);
  // 充電樁類型 (AC/DC)
  const [chargerType, setChargerType] = useState<'AC' | 'DC'>('AC');
  // DC 充電樁各 Connector 狀態
  const [connector1Status, setConnector1Status] = useState<'Available' | 'Preparing' | 'Charging' | 'Finishing'>('Available');
  const [connector2Status, setConnector2Status] = useState<'Available' | 'Preparing' | 'Charging' | 'Finishing'>('Available');
  // DC 充電樁各 Connector 的交易ID和累積度數
  const [connector1TransactionId, setConnector1TransactionId] = useState<number | null>(null);
  const [connector2TransactionId, setConnector2TransactionId] = useState<number | null>(null);
  const [connector1Energy, setConnector1Energy] = useState(0);
  const [connector2Energy, setConnector2Energy] = useState(0);
  // DC 充電樁各 Connector 的 MeterValues 計時器
  const meter1TimerRef = useRef<NodeJS.Timeout | null>(null);
  const meter2TimerRef = useRef<NodeJS.Timeout | null>(null);
  // 心跳間隔
  const [heartbeatInterval, setHeartbeatInterval] = useState<number | null>(null);
  // 心跳計時器
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 累積度數
  const [energy, setEnergy] = useState(0);
  // 交易 ID
  const [transactionId, setTransactionId] = useState<number | null>(1);
  // 從伺服器端接收的 idTag
  const [serverIdTag, setServerIdTag] = useState<string>('01');
  // MeterValues 計時器
  const meterTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ===== WebSocket 連線設定 =====
  const [serverUrl, setServerUrl] = useState('wss://ocpp.evape.com.tw:443/ocpp/websocket');
  const [cpPath, setCpPath] = useState('Jackson0929001');
  const wsUrl = `${serverUrl.trim().replace(/\/+$/, '')}/${encodeURIComponent(cpPath.trim())}`;

  // ===== 日誌紀錄 =====
  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // ===== OCPP 狀態機與 WebSocket hook 整合 =====
  const {
    status,
    socketRef,
    connect,
    disconnect,
  } = useWebSocket(wsUrl, (event: MessageEvent) => {
    if (!event || typeof event !== 'object' || !('data' in event)) return;
    if (handleQrMessage(event.data)) return;
    handleMessage(event);
  });
  const { qrState, refreshQr, handleQrMessage } = useQrCode(socketRef, status);
  
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  
  const [ocppStatus, dispatchOcpp] = useOcppStateMachine('Available');
  const ocppService = new OcppService(socketRef, appendLog);

  // ===== 計時器管理函數 =====
  const clearHeartbeatTimer = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      console.log('Heartbeat timer cleared');
      heartbeatTimerRef.current = null;
    }
  };

  const startHeartbeatTimer = (intervalSec: number) => {
    clearHeartbeatTimer();
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, intervalSec * 1000);
    console.log(`Heartbeat timer started, interval: ${intervalSec} 秒`);
  };

  const clearMeterTimer = (connectorId?: number) => {
    if (chargerType === 'DC' && connectorId) {
      if (connectorId === 1 && meter1TimerRef.current) {
        clearInterval(meter1TimerRef.current);
        meter1TimerRef.current = null;
        appendLog('MeterValues timer C1 cleared');
      } else if (connectorId === 2 && meter2TimerRef.current) {
        clearInterval(meter2TimerRef.current);
        meter2TimerRef.current = null;
        appendLog('MeterValues timer C2 cleared');
      }
    } else {
      if (meterTimerRef.current) {
        clearInterval(meterTimerRef.current);
        meterTimerRef.current = null;
        appendLog('MeterValues timer cleared');
      }
    }
  };

  const startMeterTimer = (txId: number, targetConnectorId?: number) => {
    const actualConnectorId = targetConnectorId || (chargerType === 'DC' ? connectorId : 1);
    
    if (chargerType === 'DC' && targetConnectorId) {
      clearMeterTimer(targetConnectorId);
      
      if (targetConnectorId === 1) {
        setConnector1Energy(0);
        meter1TimerRef.current = setInterval(() => {
          setConnector1Energy(prev => {
            const next = prev + Math.random() * 2 + 0.5;
            if (socketRef.current && socketRef.current.readyState === 1) {
              const meterPayload = {
                connectorId: 1,
                transactionId: connector1TransactionId || txId,
                meterValue: [
                  {
                    timestamp: new Date().toISOString(),
                    sampledValue: [
                      { value: next.toFixed(2), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }
                    ]
                  }
                ]
              };
              const ocppMeterMsg = JSON.stringify([2, `uid-${Date.now()}`, 'MeterValues', meterPayload]);
              socketRef.current.send(ocppMeterMsg);
              appendLog(`Sent MeterValues C1: ${ocppMeterMsg}`);
            }
            return next;
          });
        }, 10000);
        appendLog('MeterValues timer C1 started');
      } else if (targetConnectorId === 2) {
        setConnector2Energy(0);
        meter2TimerRef.current = setInterval(() => {
          setConnector2Energy(prev => {
            const next = prev + Math.random() * 2 + 0.5;
            if (socketRef.current && socketRef.current.readyState === 1) {
              const meterPayload = {
                connectorId: 2,
                transactionId: connector2TransactionId || txId,
                meterValue: [
                  {
                    timestamp: new Date().toISOString(),
                    sampledValue: [
                      { value: next.toFixed(2), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }
                    ]
                  }
                ]
              };
              const ocppMeterMsg = JSON.stringify([2, `uid-${Date.now()}`, 'MeterValues', meterPayload]);
              socketRef.current.send(ocppMeterMsg);
              appendLog(`Sent MeterValues C2: ${ocppMeterMsg}`);
            }
            return next;
          });
        }, 10000);
        appendLog('MeterValues timer C2 started');
      }
    } else {
      clearMeterTimer();
      setEnergy(0);
      meterTimerRef.current = setInterval(() => {
        setEnergy(prev => {
          const next = prev + 1000 * (Math.random() * 2 + 0.5); // 每10秒增加 500-2500 Wh
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
            const ocppMeterMsg = JSON.stringify([2, `uid-${Date.now()}`, 'MeterValues', meterPayload]);
            socketRef.current.send(ocppMeterMsg);
            appendLog(`Sent MeterValues: ${ocppMeterMsg}`);
          }
          return next;
        });
      }, 10000);
      appendLog('MeterValues timer started');
    }
  };

  // ===== OCPP 訊息處理 hook =====
  const { handleMessage, clearTransactionMapping } = useOcppMessageHandler({
    authorizeRemoteTxRequests,
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
  });

  // ===== OCPP 操作函數 =====
  const sendBootNotification = () => {
    console.log('sendBootNotification status:', statusRef.current);
    if (socketRef.current && statusRef.current === 'CONNECTED') {
      const payload = {
        chargePointVendor: 'DemoVendor',
        chargePointModel: chargerType === 'DC' ? 'DC-FastCharger-Dual' : 'AC-Charger-Single',
        chargePointSerialNumber: `CP-${chargerType}-123456`,
        chargeBoxSerialNumber: `CB-${chargerType}-123456`,
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
      appendLog(`Sent BootNotification (${chargerType}): ${ocppMessage}`);
    } else {
      appendLog('無法送出 BootNotification，WebSocket 尚未連線');
    }
  };

  const sendAuthorize = () => {
    if (socketRef.current && statusRef.current === 'CONNECTED') {
      const payload = {
        idTag: serverIdTag || 'DEMO_IDTAG',
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

  const sendHeartbeat = () => {
    if (socketRef.current && socketRef.current.readyState === 1) {
      const ocppMessage = JSON.stringify([
        2,
        `uid-${Date.now()}`,
        'Heartbeat',
        {}
      ]);
      socketRef.current.send(ocppMessage);
      appendLog(`Sent Heartbeat: ${ocppMessage}`);
    }
  };

  const handlePlugIn = (targetConnectorId: number) => {
    if (socketRef.current && socketRef.current.readyState === 1) {
      ocppService.sendStatusNotification('Preparing', targetConnectorId);
      
      if (chargerType === 'DC') {
        if (targetConnectorId === 1) {
          setConnector1Status('Preparing');
        } else if (targetConnectorId === 2) {
          setConnector2Status('Preparing');
        }
      } else {
        dispatchOcpp({ type: 'PLUG_IN' });
      }
    }
  };

  const handleUnplug = (targetConnectorId: number) => {
    if (!(socketRef.current && socketRef.current.readyState === 1)) return;
    
    const connectorStatus = chargerType === 'DC' 
      ? (targetConnectorId === 1 ? connector1Status : connector2Status)
      : ocppStatus;
    
    const connectorTransactionId = chargerType === 'DC'
      ? (targetConnectorId === 1 ? connector1TransactionId : connector2TransactionId)
      : transactionId;
    
    const connectorEnergy = chargerType === 'DC'
      ? (targetConnectorId === 1 ? connector1Energy : connector2Energy)
      : energy;
    
    if (connectorStatus === 'Charging') {
      ocppService.sendStatusNotification('Finishing', targetConnectorId);
      
      if (chargerType === 'DC') {
        if (targetConnectorId === 1) {
          setConnector1Status('Finishing');
        } else if (targetConnectorId === 2) {
          setConnector2Status('Finishing');
        }
      } else {
        dispatchOcpp({ type: 'UNPLUG' });
      }
      
      setTimeout(() => {
        if (connectorTransactionId && socketRef.current && socketRef.current.readyState === 1) {
          const uid = `uid-${Date.now()}`;
          const payload = {
            transactionId: connectorTransactionId,
            idTag: serverIdTag || 'DEMO_IDTAG',
            meterStop: Math.round(connectorEnergy),
            timestamp: new Date().toISOString(),
            reason: 'EVDisconnected'
          };
          const msg = JSON.stringify([2, uid, 'StopTransaction', payload]);
          socketRef.current.send(msg);
          appendLog(`Sent StopTransaction C${targetConnectorId}: ${msg}`);
        }
        
        setTimeout(() => {
          ocppService.sendStatusNotification('Available', targetConnectorId);
          
          if (chargerType === 'DC') {
            if (targetConnectorId === 1) {
              setConnector1Status('Available');
              setConnector1Energy(0);
              if (connector1TransactionId) {
                clearTransactionMapping(connector1TransactionId);
              }
              setConnector1TransactionId(null);
            } else if (targetConnectorId === 2) {
              setConnector2Status('Available');
              setConnector2Energy(0);
              if (connector2TransactionId) {
                clearTransactionMapping(connector2TransactionId);
              }
              setConnector2TransactionId(null);
            }
          } else {
            dispatchOcpp({ type: 'STOP_CHARGING' });
            setEnergy(0);
            if (transactionId) {
              clearTransactionMapping(transactionId);
            }
            setTransactionId(null);
          }
          setServerIdTag('');
        }, 300);
      }, 300);
    } else {
      ocppService.sendStatusNotification('Available', targetConnectorId);
      
      if (chargerType === 'DC') {
        if (targetConnectorId === 1) {
          setConnector1Status('Available');
          setConnector1Energy(0);
          if (connector1TransactionId) {
            clearTransactionMapping(connector1TransactionId);
          }
          setConnector1TransactionId(null);
        } else if (targetConnectorId === 2) {
          setConnector2Status('Available');
          setConnector2Energy(0);
          if (connector2TransactionId) {
            clearTransactionMapping(connector2TransactionId);
          }
          setConnector2TransactionId(null);
        }
      } else {
        dispatchOcpp({ type: 'UNPLUG' });
        setEnergy(0);
        if (transactionId) {
          clearTransactionMapping(transactionId);
        }
        setTransactionId(null);
      }
      setServerIdTag('');
    }
  };

  const clearLogs = () => setLogs([]);

  // 監聽 status 變化，斷線時清除 heartbeat timer
  useEffect(() => {
    if (status !== 'CONNECTED') {
      clearHeartbeatTimer();
    }
  }, [status]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        py: 3,
      }}>
        <Container maxWidth="lg">
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button variant={testMode === 'single' ? 'contained' : 'outlined'} disabled={batchActive} onClick={() => setTestMode('single')}>單台測試</Button>
            <Button variant={testMode === 'batch' ? 'contained' : 'outlined'} disabled={status !== 'DISCONNECTED'} onClick={() => setTestMode('batch')}>批次 AC 測試（50／100 台）</Button>
          </Stack>
          {testMode === 'batch' ? <BatchSimulator onActiveChange={setBatchActive} /> : <>
          <HeaderSection 
            status={status}
            chargerType={chargerType}
          />

          <Stack spacing={3}>
            <ConnectionSettings
              authorizeRemoteTxRequests={authorizeRemoteTxRequests}
              setAuthorizeRemoteTxRequests={setAuthorizeRemoteTxRequests}
              chargerType={chargerType}
              setChargerType={setChargerType}
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              cpPath={cpPath}
              setCpPath={setCpPath}
              wsUrl={wsUrl}
              status={status}
              connect={connect}
              disconnect={disconnect}
              setConnectorId={setConnectorId}
            />

            <ChargerQrCode state={qrState} connected={status === 'CONNECTED'} onRefresh={refreshQr} />

            <ChargerStatus
              chargerType={chargerType}
              ocppStatus={ocppStatus}
              energy={energy}
              transactionId={transactionId}
              connector1Status={connector1Status}
              connector2Status={connector2Status}
              connector1Energy={connector1Energy}
              connector2Energy={connector2Energy}
              connector1TransactionId={connector1TransactionId}
              connector2TransactionId={connector2TransactionId}
              serverIdTag={serverIdTag}
            />

            <OcppOperations
              status={status}
              chargerType={chargerType}
              ocppStatus={ocppStatus}
              connector1Status={connector1Status}
              connector2Status={connector2Status}
              socketRef={socketRef}
              sendBootNotification={sendBootNotification}
              sendAuthorize={sendAuthorize}
              handlePlugIn={handlePlugIn}
              handleUnplug={handleUnplug}
            />

            <PowerLimitDisplay
              watts={watts}
              amps={amps}
              profileId={profileId}
              connectorId={connectorId}
              chargerType={chargerType}
              connector1Status={connector1Status}
              connector2Status={connector2Status}
              connector1Watts={connector1Watts}
              connector1Amps={connector1Amps}
              connector1ProfileId={connector1ProfileId}
              connector2Watts={connector2Watts}
              connector2Amps={connector2Amps}
              connector2ProfileId={connector2ProfileId}
            />

            <SystemLogs
              logs={logs}
              clearLogs={clearLogs}
            />
          </Stack>
          </>}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
