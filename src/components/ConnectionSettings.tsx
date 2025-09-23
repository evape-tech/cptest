import React from 'react';
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
  chargerType: 'AC' | 'DC';
  setChargerType: (type: 'AC' | 'DC') => void;
  wsProtocol: 'ws' | 'wss';
  setWsProtocol: (protocol: 'ws' | 'wss') => void;
  domain: string;
  setDomain: (domain: string) => void;
  cpPath: string;
  setCpPath: (path: string) => void;
  wsUrl: string;
  status: string;
  connect: () => void;
  disconnect: () => void;
  setConnectorId: (id: number) => void;
}

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  chargerType,
  setChargerType,
  wsProtocol,
  setWsProtocol,
  domain,
  setDomain,
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>充電樁類型</InputLabel>
              <Select
                value={chargerType}
                label="充電樁類型"
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
            <FormControl sx={{ minWidth: 100 }}>
              <InputLabel>協定</InputLabel>
              <Select
                value={wsProtocol}
                label="協定"
                onChange={(e) => setWsProtocol(e.target.value as 'ws' | 'wss')}
              >
                <MenuItem value="ws">ws</MenuItem>
                <MenuItem value="wss">wss</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="your-domain.com"
              sx={{ flexGrow: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>CPID</InputLabel>
              <Select
                value={cpPath}
                label="CPID"
                onChange={(e) => {
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
                <MenuItem value="CP004">CP004</MenuItem>
                <MenuItem value="CP005">CP005</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
              <Button 
                variant="contained" 
                color="success" 
                onClick={connect} 
                disabled={status !== 'DISCONNECTED'}
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
