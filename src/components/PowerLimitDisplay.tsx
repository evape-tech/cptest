import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  Box,
  Typography,
  Chip,
  Divider,
} from '@mui/material';

interface PowerLimitDisplayProps {
  watts: number | '';
  amps: number | '';
  profileId: number;
  connectorId: number;
  chargerType: 'AC' | 'DC';
  connector1Status: string;
  connector2Status: string;
  // 為每個連接器添加獨立的功率限制數據
  connector1Watts?: number | '';
  connector1Amps?: number | '';
  connector1ProfileId?: number;
  connector2Watts?: number | '';
  connector2Amps?: number | '';
  connector2ProfileId?: number;
}

export const PowerLimitDisplay: React.FC<PowerLimitDisplayProps> = ({
  watts,
  amps,
  profileId,
  connectorId,
  chargerType,
  connector1Status,
  connector2Status,
  connector1Watts = '',
  connector1Amps = '',
  connector1ProfileId = 0,
  connector2Watts = '',
  connector2Amps = '',
  connector2ProfileId = 0,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'success';
      case 'Occupied':
        return 'warning';
      case 'Charging':
        return 'info';
      case 'Faulted':
        return 'error';
      default:
        return 'default';
    }
  };

  const ConnectorPowerInfo = ({ 
    connectorNum, 
    status, 
    watts, 
    amps, 
    profileId 
  }: { 
    connectorNum: number; 
    status: string; 
    watts: number | ''; 
    amps: number | ''; 
    profileId: number; 
  }) => (
    <Box sx={{ 
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      p: 2,
      backgroundColor: 'transparent'
    }}>
      <Typography variant="h6" gutterBottom>
        連接器 {connectorNum}
        <Chip
          label={status}
          color={getStatusColor(status) as any}
          size="small"
          sx={{ ml: 1 }}
        />
      </Typography>
      
      <Stack spacing={1}>
        <Box>
          <Typography variant="body2" color="textSecondary">
            功率限制
          </Typography>
          <Typography variant="h6" color="primary">
            {watts || '未設定'} W
          </Typography>
        </Box>

        <Box>
          <Typography variant="body2" color="textSecondary">
            電流限制
          </Typography>
          <Typography variant="h6" color="primary">
            {amps || '未設定'} A
          </Typography>
        </Box>

        <Box>
          <Typography variant="body2" color="textSecondary">
            充電配置檔 ID
          </Typography>
          <Typography variant="body1">
            {profileId || '無'}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );

  return (
    <Card>
      <CardHeader 
        title="電槍功率限制" 
        titleTypographyProps={{ variant: 'h6', color: 'primary.main' }}
        sx={{ pb: 1 }}
      />
      <CardContent>
        <Stack spacing={3}>
          {chargerType === 'AC' ? (
            // AC充電樁只顯示一個連接器
            <ConnectorPowerInfo
              connectorNum={1}
              status={connector1Status}
              watts={connector1Watts || watts}
              amps={connector1Amps || amps}
              profileId={connector1ProfileId || profileId}
            />
          ) : (
            // DC充電樁顯示兩個連接器
            <>
              <Typography variant="h6" gutterBottom>
                所有連接器功率限制
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <ConnectorPowerInfo
                  connectorNum={1}
                  status={connector1Status}
                  watts={connector1Watts || (connectorId === 1 ? watts : '')}
                  amps={connector1Amps || (connectorId === 1 ? amps : '')}
                  profileId={connector1ProfileId || (connectorId === 1 ? profileId : 0)}
                />
                <ConnectorPowerInfo
                  connectorNum={2}
                  status={connector2Status}
                  watts={connector2Watts || (connectorId === 2 ? watts : '')}
                  amps={connector2Amps || (connectorId === 2 ? amps : '')}
                  profileId={connector2ProfileId || (connectorId === 2 ? profileId : 0)}
                />
              </Stack>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};
