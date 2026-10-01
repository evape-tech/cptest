import React from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { QrState } from '../qrCode';

export function ChargerQrCode({ state, connected, onRefresh, title = '充電樁 QR Code' }: {
  state: QrState;
  connected: boolean;
  onRefresh: () => void;
  title?: string;
}) {
  return <Card variant="outlined"><CardContent><Stack spacing={2} alignItems="flex-start">
    <Typography variant="h6">{title}</Typography>
    <Button variant="outlined" disabled={!connected} onClick={onRefresh}>重新取得 QR Code</Button>
    {!connected ? <Alert severity="info">連上 OCPP 後會自動取得 QR Code。</Alert>
      : state.phase === 'loading' ? <Alert severity="info">正在向後台取得 QR Code…</Alert>
      : state.phase === 'error' ? <Alert severity="error">{state.error}</Alert>
      : state.phase === 'ready' && state.symbol ? <>
        <Box sx={{ width: '100%', maxWidth: Math.max(256, state.symbol.size * 4) }}>
          <svg role="img" aria-label="後台回傳內容的 QR Code" width="100%"
            viewBox={`0 0 ${state.symbol.size} ${state.symbol.size}`} shapeRendering="crispEdges"
            xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', backgroundColor: '#fff' }}>
            <rect width={state.symbol.size} height={state.symbol.size} fill="#fff" />
            <path d={state.symbol.path} fill="#000" />
          </svg>
        </Box>
        <Typography component="pre" data-testid="qr-content" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%', fontFamily: 'monospace' }}>{state.content}</Typography>
      </> : <Alert severity="info">尚未取得 QR Code。</Alert>}
  </Stack></CardContent></Card>;
}
