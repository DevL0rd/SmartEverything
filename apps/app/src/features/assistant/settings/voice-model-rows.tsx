import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { useAssistantStatus } from '../data/assistant-data';
import { voiceModelSummary } from './voice-model';

export function VoiceModelSummaryRow(): ReactNode {
  const status = useAssistantStatus();
  return (
    <ListRow
      title="Current setup"
      icon="sparkles"
      subtitle={status === null ? 'Loading…' : voiceModelSummary(status.settings.voice)}
      wrapSubtitle
    />
  );
}
