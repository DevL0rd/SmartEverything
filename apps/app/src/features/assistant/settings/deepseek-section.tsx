import type { ReactNode } from 'react';
import { useDeepSeekActions, useDeepSeekStatus } from '../data/deepseek';
import { DeepSeekRow } from '../provider/deepseek-row';

export function DeepSeekSection(): ReactNode {
  const status = useDeepSeekStatus();
  const actions = useDeepSeekActions();
  return <DeepSeekRow set={status.data?.key === 'set'} actions={actions} />;
}
