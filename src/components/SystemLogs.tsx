import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Paper,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';

interface SystemLogsProps {
  logs: string[];
  clearLogs: () => void;
}

export const SystemLogs: React.FC<SystemLogsProps> = ({
  logs,
  clearLogs,
}) => {
  return (
    <Card>
      <CardHeader 
        title="系統日誌" 
        titleTypographyProps={{ variant: 'h6', color: 'primary.main' }}
        action={
          <Tooltip title="清除日誌">
            <IconButton onClick={clearLogs} color="secondary">
              ❌
            </IconButton>
          </Tooltip>
        }
        sx={{ pb: 1 }}
      />
      <CardContent>
        <Paper 
          variant="outlined" 
          sx={{ 
            maxHeight: 400, 
            overflowY: 'auto', 
            p: 2,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            fontFamily: 'monospace'
          }}
        >
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              暫無日誌記錄
            </Typography>
          ) : (
            logs.map((log, index) => (
              <Typography 
                variant="body2" 
                key={index} 
                sx={{ 
                  whiteSpace: 'pre-line',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: log.includes('Error') || log.includes('error') ? 'error.main' :
                         log.includes('Sent') ? 'success.light' :
                         log.includes('Received') ? 'info.light' : 'text.primary',
                  mb: 0.5
                }}
              >
                {log}
              </Typography>
            ))
          )}
        </Paper>
      </CardContent>
    </Card>
  );
};
