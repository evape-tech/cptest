import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
} from '@mui/material';

interface HeaderSectionProps {
  status: string;
  chargerType: 'AC' | 'DC';
}

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  status,
  chargerType,
}) => {
  return (
    <Card sx={{ mb: 3, overflow: 'visible' }}>
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
          <Typography variant="h4" sx={{ 
            background: 'linear-gradient(45deg, #00e676 30%, #2196f3 90%)',
            backgroundClip: 'text',
            textFillColor: 'transparent',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            ⚡ 充電樁測試控制台
          </Typography>
        </Box>
        
        {/* 連線狀態 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Chip 
            label={`🔗 連線狀態: ${status}`}
            color={status === 'CONNECTED' ? 'success' : status === 'CONNECTING' ? 'warning' : 'error'}
            variant="filled"
            sx={{ fontSize: '0.9rem', px: 2 }}
          />
          <Chip 
            label={`⚙️ ${chargerType} ${chargerType === 'DC' ? '雙槍' : '單槍'}`}
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.9rem' }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};
