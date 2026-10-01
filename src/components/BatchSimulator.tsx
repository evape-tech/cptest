import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { BatchConfig, BatchStation, StationSnapshot, stationIds, validateBatchConfig } from '../batchSimulator';
import { AuthorizeRemoteSwitch } from './AuthorizeRemoteSwitch';
import { ChargerQrCode } from './ChargerQrCode';

const defaults: BatchConfig = {
  endpoint: '', prefix: 'TESTAC', firstNumber: 1, count: 50, idTag: 'TEST_TAG',
  powerKw: 7, meterSeconds: 10, connectGapMs: 100,
  authorizeRemoteTxRequests: false,
};

export function BatchSimulator({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const [config, setConfig] = useState(defaults);
  const [rows, setRows] = useState<StationSnapshot[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState('');
  const [applied, setApplied] = useState(false);
  const [selectedQr, setSelectedQr] = useState<string | null>(null);
  const stations = useRef<BatchStation[]>([]);
  const appliedConfig = useRef<BatchConfig | null>(null);
  const logBuffer = useRef<string[]>([]);
  const mounted = useRef(true);
  const run = useRef(0);

  const refresh = () => {
    if (!mounted.current) return;
    setRows(stations.current.map(station => ({ ...station.snapshot })));
    setLogs([...logBuffer.current]);
  };
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(refresh, 500);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      stations.current.forEach(station => station.dispose());
    };
  }, []);

  const log = (message: string) => {
    logBuffer.current.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (logBuffer.current.length > 200) logBuffer.current.splice(0, logBuffer.current.length - 200);
  };
  const update = <K extends keyof BatchConfig>(key: K, value: BatchConfig[K]) => {
    setConfig(previous => ({ ...previous, [key]: value }));
    setApplied(false);
    setError('');
  };
  const apply = () => {
    try {
      const ids = stationIds(config);
      stations.current.forEach(station => station.dispose());
      logBuffer.current = [];
      stations.current = ids.map(id => new BatchStation({ ...config }, id, log));
      setSelectedQr(ids[0]);
      appliedConfig.current = { ...config };
      setApplied(true);
      setError('');
      log(`已建立 ${ids.length} 台 AC 單槍；尚未連線`);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const connectAll = async () => {
    try { validateBatchConfig(config); }
    catch (e) { setError(e instanceof Error ? e.message : '設定有誤'); return; }
    if (!applied) { setError('請先按「套用台數與設定」'); return; }
    // New instances make every run independent, including all request/timer state.
    stations.current = stationIds(config).map(id => new BatchStation({ ...config }, id, log));
    setError('');
    setActive(true);
    onActiveChange(true);
    setBusy('連線中');
    const currentRun = ++run.current;
    const jobs: Promise<void>[] = [];
    for (const station of stations.current) {
      if (!mounted.current || run.current !== currentRun) break;
      jobs.push(station.connect());
      if (config.connectGapMs > 0) await new Promise(resolve => setTimeout(resolve, config.connectGapMs));
    }
    await Promise.allSettled(jobs);
    if (mounted.current && run.current === currentRun) { setBusy(''); refresh(); }
  };
  const operate = async (label: string, operation: (station: BatchStation) => Promise<void>) => {
    setBusy(label);
    await Promise.allSettled(stations.current.map(operation));
    if (mounted.current) { setBusy(''); refresh(); }
  };
  const disconnectAll = async () => {
    run.current++;
    setBusy('結束交易並斷線中');
    await Promise.allSettled(stations.current.map(station => station.disconnect()));
    if (mounted.current) {
      setActive(false);
      onActiveChange(false);
      setBusy('');
      refresh();
      if (stations.current.some(station => station.snapshot.transactionId !== null)) {
        setError('部分交易未收到停止確認，請先匯出結果並至後台確認，不要直接重跑。');
      }
    }
  };
  const exportResults = () => {
    const data = { exportedAt: new Date().toISOString(), config: appliedConfig.current,
      stations: stations.current.map(station => station.snapshot), logs: logBuffer.current };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ac-batch-${appliedConfig.current?.count}-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const ready = rows.filter(row => ['Available', 'Preparing'].includes(row.phase)).length;
  const transactions = rows.filter(row => row.transactionId !== null).length;
  const qrRow = rows.find(row => row.cpid === selectedQr);

  return <Card><CardContent>
    <Stack spacing={2}>
      <Typography variant="h5">批次 AC 充電模擬</Typography>
      <Alert severity="info">每台獨立連線、使用 Connector 1。「套用」只產生清單；按「全部連線」才會連到指定後台。CPID 與 idTag 需由該後台允許。</Alert>
      <Stack direction="row" spacing={1}>
        <Button disabled={active || !!busy} variant={config.count === 50 ? 'contained' : 'outlined'} onClick={() => update('count', 50)}>50 台 AC 單槍</Button>
        <Button disabled={active || !!busy} variant={config.count === 100 ? 'contained' : 'outlined'} onClick={() => update('count', 100)}>100 台 AC 單槍</Button>
      </Stack>
      <TextField label="批次 OCPP 後台網址" value={config.endpoint} disabled={active || !!busy}
        placeholder="wss://主機:443/ocpp/websocket" helperText="不含 CPID；每台 CPID 會自動接在網址最後。另一套後台網址可稍後再填。"
        onChange={e => update('endpoint', e.target.value)} />
      <AuthorizeRemoteSwitch value={config.authorizeRemoteTxRequests}
        onChange={value => update('authorizeRemoteTxRequests', value)} disabled={active || !!busy} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
        <TextField label="CPID 前綴" value={config.prefix} disabled={active || !!busy} onChange={e => update('prefix', e.target.value)} />
        <TextField label="起始編號" type="number" value={config.firstNumber} disabled={active || !!busy} onChange={e => update('firstNumber', Number(e.target.value))} />
        <TextField label="台數（1～100）" type="number" value={config.count} disabled={active || !!busy} onChange={e => update('count', Number(e.target.value))} />
        <TextField label="授權 idTag" value={config.idTag} disabled={active || !!busy} onChange={e => update('idTag', e.target.value)} />
        <TextField label="每台功率（kW）" type="number" value={config.powerKw} disabled={active || !!busy} onChange={e => update('powerKw', Number(e.target.value))} />
        <TextField label="電表回報間隔（秒）" type="number" value={config.meterSeconds} disabled={active || !!busy} onChange={e => update('meterSeconds', Number(e.target.value))} />
        <TextField label="各台連線間隔（毫秒）" type="number" value={config.connectGapMs} disabled={active || !!busy} helperText="0 表示一起建立連線" onChange={e => update('connectGapMs', Number(e.target.value))} />
      </Box>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
        <Button variant="contained" disabled={active || !!busy} onClick={apply}>套用台數與設定</Button>
        <Button variant="contained" color="success" disabled={!applied || active || !!busy || !config.endpoint.trim()} onClick={connectAll}>全部連線並註冊</Button>
        <Button disabled={!active || !!busy || !ready} onClick={() => operate('插槍中', s => s.plug())}>全部插槍（等待後台啟動）</Button>
        <Button variant="outlined" disabled={!active || !!busy || !ready} onClick={() => operate('啟動中', s => s.start())}>全部開始模擬充電</Button>
        <Button disabled={!active || !!busy || !transactions} onClick={() => operate('停止中', s => s.stop())}>全部停止充電</Button>
        <Button color="warning" disabled={!active || (!!busy && busy !== '連線中')} onClick={disconnectAll}>結束交易並全部斷線</Button>
        <Button disabled={!rows.length} onClick={exportResults}>匯出結果</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">「全部開始」會由各台送 Authorize 與 StartTransaction；若要驗證後台遠端啟動，請用「全部插槍」，再從後台下指令。固定功率模擬尚不支援 SetChargingProfile。CPU／記憶體需由後台監控取得。</Typography>
      {!applied && rows.length > 0 && <Alert severity="warning">設定已變更，請重新套用後再連線。</Alert>}
      {!!error && <Alert severity="error">{error}</Alert>}
      {!!busy && <Alert severity="info">{busy}… 請等待回覆，單次訊息逾時為 15 秒。</Alert>}
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
        <Chip label={`已套用 ${rows.length} 台`} />
        <Chip label={`已連線 ${rows.filter(r => r.connected).length}`} />
        <Chip color="success" label={`充電中 ${rows.filter(r => r.phase === 'Charging').length}`} />
        <Chip label={`錯誤累計 ${rows.reduce((n, r) => n + r.errors, 0)}`} />
      </Stack>
      <TableContainer sx={{ maxHeight: 430 }}><Table stickyHeader size="small" aria-label="批次充電樁清單">
        <TableHead><TableRow>{['CPID', '狀態', '交易 ID', '累積 Wh', '送出／收到', '最近回應 ms', '最近錯誤', 'QR Code'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.map(row => <TableRow key={row.cpid}>
          <TableCell>{row.cpid}</TableCell><TableCell>{row.phase}</TableCell>
          <TableCell>{row.transactionId ?? '—'}</TableCell><TableCell>{row.energyWh.toFixed(2)}</TableCell>
          <TableCell>{row.sent}／{row.received}</TableCell><TableCell>{row.lastRttMs ?? '—'}</TableCell><TableCell>{row.lastError || '—'}</TableCell>
          <TableCell><Button size="small" aria-label={`查看 ${row.cpid} QR Code`} onClick={() => setSelectedQr(row.cpid)}>
            {row.qrState.phase === 'ready' ? '查看' : row.qrState.phase === 'loading' ? '取得中' : row.qrState.phase === 'error' ? '取得失敗' : '未取得'}
          </Button></TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      {qrRow && <ChargerQrCode title={`${qrRow.cpid} QR Code`} state={qrRow.qrState} connected={qrRow.connected}
        onRefresh={() => { stations.current.find(station => station.snapshot.cpid === selectedQr)?.refreshQr(); refresh(); }} />}
      <Typography variant="subtitle2">批次日誌（保留最近 200 筆）</Typography>
      <Box component="pre" sx={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>{logs.join('\n') || '尚未套用設定'}</Box>
    </Stack>
  </CardContent></Card>;
}
