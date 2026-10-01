import React from 'react';
import { AuthorizeRemoteSwitch } from './AuthorizeRemoteSwitch';
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  Typography,
} from '@mui/material';

interface ConnectionSettingsProps {
  authorizeRemoteTxRequests: boolean;
  setAuthorizeRemoteTxRequests: (value: boolean) => void;
  chargerType: 'AC' | 'DC';
  setChargerType: (type: 'AC' | 'DC') => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  cpPath: string;
  setCpPath: (path: string) => void;
  wsUrl: string;
  status: string;
  connect: () => void;
  disconnect: () => void;
  setConnectorId: (id: number) => void;
}

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  authorizeRemoteTxRequests,
  setAuthorizeRemoteTxRequests,
  chargerType,
  setChargerType,
  serverUrl,
  setServerUrl,
  cpPath,
  setCpPath,
  wsUrl,
  status,
  connect,
  disconnect,
  setConnectorId,
}) => {
  return (
    <Card>
      <CardHeader 
        title="連線設定" 
        titleTypographyProps={{ variant: 'h6', color: 'primary.main' }}
        sx={{ pb: 1 }}
      />
      <CardContent>
        <Stack spacing={2}>
          <AuthorizeRemoteSwitch value={authorizeRemoteTxRequests}
            onChange={setAuthorizeRemoteTxRequests} disabled={status !== 'DISCONNECTED'} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>充電樁類型</InputLabel>
              <Select
                value={chargerType}
                label="充電樁類型"
                disabled={status !== 'DISCONNECTED'}
                onChange={(e) => {
                  setChargerType(e.target.value as 'AC' | 'DC');
                  if (e.target.value === 'AC') {
                    setConnectorId(1);
                  }
                }}
              >
                <MenuItem value="AC">AC 單槍</MenuItem>
                <MenuItem value="DC">DC 雙槍</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="OCPP 後台網址"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="wss://主機:443/ocpp/websocket"
              helperText="填入協定、主機與路徑；CPID 會自動接在最後"
              disabled={status !== 'DISCONNECTED'}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
                value={cpPath}
                label="CPID"
                onChange={(e) => setCpPath(e.target.value)}
                disabled={status !== 'DISCONNECTED'}
                sx={{ minWidth: 200 }}
            />
            <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
              <Button 
                variant="contained" 
                color="success" 
                onClick={connect} 
                disabled={status !== 'DISCONNECTED' || !cpPath.trim() || !/^wss?:\/\/[^\s]+$/.test(serverUrl.trim())}
                sx={{ flexGrow: 1 }}
              >
                🔗 連線
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                onClick={disconnect} 
                disabled={status !== 'CONNECTED'}
                sx={{ flexGrow: 1 }}
              >
                ❌ 斷線
              </Button>
            </Stack>
          </Stack>
          <Alert severity="info">
            <Typography variant="body2">
              連線網址：{wsUrl}
            </Typography>
          </Alert>
        </Stack>
      </CardContent>
    </Card>
  );
};
