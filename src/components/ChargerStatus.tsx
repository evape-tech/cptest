import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  Box,
  Typography,
  Chip,
  Alert,
} from '@mui/material';

interface ChargerStatusProps {
  chargerType: 'AC' | 'DC';
  // AC 充電樁狀態
  ocppStatus: string;
  energy: number;
  transactionId: number | null;
  // DC 充電樁狀態
  connector1Status: string;
  connector2Status: string;
  connector1Energy: number;
  connector2Energy: number;
  connector1TransactionId: number | null;
  connector2TransactionId: number | null;
  // 伺服器 idTag
  serverIdTag: string;
}

export const ChargerStatus: React.FC<ChargerStatusProps> = ({
  chargerType,
  ocppStatus,
  energy,
  transactionId,
  connector1Status,
  connector2Status,
  connector1Energy,
  connector2Energy,
  connector1TransactionId,
  connector2TransactionId,
  serverIdTag,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'success';
      case 'Preparing':
        return 'warning';
      case 'Charging':
        return 'primary';
      case 'Finishing':
        return 'error';
      default:
        return 'default';
    }
  };

  const renderConnectorCard = (
    connectorId: number,
    status: string,
    energy: number,
    transactionId: number | null
  ) => (
    <Card variant="outlined" sx={{ flex: 1 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">⚡ Connector {connectorId}</Typography>
          <Chip 
            label={status}
            size="small"
            color={getStatusColor(status) as any}
            sx={{ ml: 'auto' }}
          />
        </Box>
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">
              🔋 累積度數：{energy.toFixed(2)} Wh
            </Typography>
          </Box>
          {transactionId && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2">
                🕒 交易ID：{transactionId}
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader 
        title="充電樁狀態" 
        titleTypographyProps={{ variant: 'h6', color: 'primary.main' }}
        sx={{ pb: 1 }}
      />
      <CardContent>
        {chargerType === 'DC' ? (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            {renderConnectorCard(1, connector1Status, connector1Energy, connector1TransactionId)}
            {renderConnectorCard(2, connector2Status, connector2Energy, connector2TransactionId)}
          </Stack>
        ) : (
          renderConnectorCard(1, ocppStatus, energy, transactionId)
        )}
        
        {serverIdTag && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              伺服器 idTag：{serverIdTag}
            </Typography>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
