import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  Button,
  Typography,
  Box,
  Divider,
} from '@mui/material';

interface OcppOperationsProps {
  status: string;
  chargerType: 'AC' | 'DC';
  ocppStatus: string;
  connector1Status: string;
  connector2Status: string;
  socketRef: React.MutableRefObject<WebSocket | null>;
  sendBootNotification: () => void;
  sendAuthorize: () => void;
  handlePlugIn: (connectorId: number) => void;
  handleUnplug: (connectorId: number) => void;
}

export const OcppOperations: React.FC<OcppOperationsProps> = ({
  status,
  chargerType,
  ocppStatus,
  connector1Status,
  connector2Status,
  socketRef,
  sendBootNotification,
  sendAuthorize,
  handlePlugIn,
  handleUnplug,
}) => {
  return (
    <Card>
      <CardHeader 
        title="OCPP 操作" 
        titleTypographyProps={{ variant: 'h6', color: 'primary.main' }}
        sx={{ pb: 1 }}
      />
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={sendBootNotification} 
            disabled={status !== 'CONNECTED'}
          >
            🔌 BootNotification
          </Button>
          <Button 
            variant="contained" 
            color="secondary" 
            onClick={sendAuthorize} 
            disabled={status !== 'CONNECTED'}
          >
            ⚙️ Authorize
          </Button>
        </Stack>

        {/* 充電樁操作按鈕 */}
        {chargerType === 'AC' ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                AC 充電樁操作
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button 
                  variant="contained" 
                  color="info" 
                  onClick={() => handlePlugIn(1)} 
                  disabled={ocppStatus !== 'Available' || !(socketRef.current && socketRef.current.readyState === 1)}
                  sx={{ flex: 1 }}
                >
                  🔌 插槍 C1
                </Button>
                <Button 
                  variant="contained" 
                  color="warning" 
                  onClick={() => handleUnplug(1)} 
                  disabled={ocppStatus === 'Available'}
                  sx={{ flex: 1 }}
                >
                  🔌 拔槍 C1
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 3, fontWeight: 'bold' }}>
                DC 充電樁操作
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                    Connector 1
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Button 
                      variant="contained" 
                      color="info" 
                      onClick={() => handlePlugIn(1)} 
                      disabled={connector1Status !== 'Available' || !(socketRef.current && socketRef.current.readyState === 1)}
                      sx={{ flex: 1 }}
                    >
                      🔌 插槍 C1
                    </Button>
                    <Button 
                      variant="contained" 
                      color="warning" 
                      onClick={() => handleUnplug(1)} 
                      disabled={connector1Status === 'Available'}
                      sx={{ flex: 1 }}
                    >
                      🔌 拔槍 C1
                    </Button>
                  </Stack>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                    Connector 2
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Button 
                      variant="contained" 
                      color="info" 
                      onClick={() => handlePlugIn(2)} 
                      disabled={connector2Status !== 'Available' || !(socketRef.current && socketRef.current.readyState === 1)}
                      sx={{ flex: 1 }}
                    >
                      🔌 插槍 C2
                    </Button>
                    <Button 
                      variant="contained" 
                      color="warning" 
                      onClick={() => handleUnplug(2)} 
                      disabled={connector2Status === 'Available'}
                      sx={{ flex: 1 }}
                    >
                      🔌 拔槍 C2
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
