import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { useEntryWriteState } from '../../health-log';

export function EntryWritesRow(): ReactNode {
  const state = useEntryWriteState();
  if (state.kind === 'needs_permission') {
    return (
      <ListRow
        icon="fitness"
        title="Save what you log to Health Connect"
        subtitle={`${String(state.waiting)} waiting · Allow in Health Connect`}
        subtitleTone="warning"
        href={href.settings.focus('health', 'health-connect')}
        chevron
      />
    );
  }
  const problem =
    state.kind === 'failed'
      ? state.reason
      : state.kind === 'saved' && state.failed > 0
        ? `${String(state.failed)} could not be saved · open them to see why`
        : null;
  return (
    <ListRow
      icon="fitness"
      title="Save what you log to Health Connect"
      subtitle={problem ?? 'Food, water and anything you log here, right away'}
      subtitleTone={problem === null ? 'variant' : 'critical'}
    />
  );
}
