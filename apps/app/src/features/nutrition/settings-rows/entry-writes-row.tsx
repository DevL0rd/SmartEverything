import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { allowEntryWrites, useEntryWriteState } from '../../health-log';

export function EntryWritesRow(): ReactNode {
  const state = useEntryWriteState();
  if (state.kind === 'needs_permission') {
    return (
      <ListRow
        icon="fitness"
        title="Save what you log to Health Connect"
        subtitle={`Needs permission · ${String(state.waiting)} waiting`}
        subtitleTone="warning"
        trailing={
          <Button
            label="Allow"
            variant="tonal"
            onPress={() => {
              allowEntryWrites(state.types).catch((error: unknown) => {
                notify({
                  message: 'Health Connect permission not changed',
                  error,
                  tone: 'critical',
                });
              });
            }}
          />
        }
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
