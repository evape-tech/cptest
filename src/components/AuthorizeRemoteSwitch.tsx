import React from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';

export function AuthorizeRemoteSwitch({ value, onChange, disabled = false }: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return <Box>
    <FormControlLabel
      control={<Switch checked={value} disabled={disabled} onChange={(_, checked) => onChange(checked)} />}
      label={`AuthorizeRemoteTxRequests：${value ? 'true' : 'false'}`}
    />
    <Typography variant="body2" color="text.secondary">
      true：收到遠端啟動後，先向後台送 Authorize，授權成功才送 StartTransaction。
      false：遠端啟動不額外送 Authorize。只影響遠端啟動；此模擬器未使用本地授權快取。
    </Typography>
  </Box>;
}
