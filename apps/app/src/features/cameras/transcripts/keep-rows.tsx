import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import {
  useTranscriptActions,
  useTranscriptSettings,
  useTranscriptStatus,
} from '../data/use-transcripts';
import { useMoney } from '../../region';
import { capOptions, retentionOptions } from './transcript-model';

function failed(message: string): (error: unknown) => void {
  return (error): void => {
    notify({ message, error, tone: 'critical' });
  };
}

export function RetentionRow(): ReactNode {
  const settings = useTranscriptSettings();
  const actions = useTranscriptActions();
  if (settings.data === undefined) {
    return null;
  }
  return (
    <SelectRow
      title="Keep camera transcripts"
      subtitle="Counted from its last line"
      icon="clock"
      options={retentionOptions(settings.data)}
      value={String(settings.data.retention_days)}
      onChange={(days) => {
        actions
          .saveSettings({ retention_days: Number(days) })
          .catch(failed('The retention wasn’t changed'));
      }}
    />
  );
}

export function BudgetRow(): ReactNode {
  const settings = useTranscriptSettings();
  const status = useTranscriptStatus();
  const actions = useTranscriptActions();
  const money = useMoney();
  if (settings.data === undefined) {
    return null;
  }
  return (
    <SelectRow
      title="Daily transcribing budget"
      subtitle={
        status.data === undefined
          ? 'Camera listening'
          : `${money.dollars(status.data.spent_usd)} used today`
      }
      icon="gauge"
      options={capOptions(settings.data, money)}
      value={String(settings.data.daily_cap_usd)}
      onChange={(cap) => {
        actions
          .saveSettings({ daily_cap_usd: Number(cap) })
          .catch(failed('The daily budget wasn’t changed'));
      }}
    />
  );
}
