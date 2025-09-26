// useOcppStateMachine.ts
// OCPP 狀態機 hook，專責管理 OCPP 標準狀態流轉
// 用法：
//   const [state, dispatch] = useOcppStateMachine('Available')
//   dispatch({ type: 'PLUG_IN' })
// 支援 OCPP 1.6 標準狀態與事件

import { useState } from 'react';

// OCPP 1.6 標準狀態
const OCPP_STATES = [
  'Available',
  'Preparing',
  'Charging',
  'SuspendedEV',
  'SuspendedEVSE',
  'Finishing',
  'Reserved',
  'Unavailable',
  'Faulted',
  'Occupied',
] as const;
export type OcppState = typeof OCPP_STATES[number];

// OCPP 狀態機事件型別
export type OcppEvent =
  | { type: 'PLUG_IN' }
  | { type: 'UNPLUG' }
  | { type: 'REMOTE_START' }
  | { type: 'REMOTE_STOP' }
  | { type: 'START_CHARGING' }
  | { type: 'STOP_CHARGING' };

// 狀態機主體，根據當前狀態與事件決定下一個狀態
function ocppStateMachine(state: OcppState, event: OcppEvent): OcppState {
  switch (state) {
    case 'Available':
      if (event.type === 'PLUG_IN') return 'Preparing';
      break;
    case 'Preparing':
      if (event.type === 'REMOTE_START') return 'Charging';
      if (event.type === 'START_CHARGING') return 'Charging';
      if (event.type === 'UNPLUG') return 'Available';
      break;
    case 'Charging':
      if (event.type === 'REMOTE_STOP' || event.type === 'UNPLUG') return 'Finishing';
      break;
    case 'Finishing':
      if (event.type === 'STOP_CHARGING') return 'Available';
      break;
    // 其他 OCPP 狀態可擴充
  }
  return state;
}

/**
 * useOcppStateMachine hook
 * @param initialState - 初始 OCPP 狀態
 * @returns [state, dispatch] 狀態與事件派發函數
 */
export function useOcppStateMachine(initialState: OcppState) {
  const [state, setState] = useState<OcppState>(initialState);
  function dispatch(event: OcppEvent) {
    setState(prev => ocppStateMachine(prev, event));
  }
  return [state, dispatch] as const;
} 