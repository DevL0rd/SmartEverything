import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { useHasScale } from '../../profiles';
import { allowWritesAndSave, useWriteState } from '../../profiles';

function allow(): void {
  allowWritesAndSave().catch((error: unknown) => {
    notify({
      message: 'Weigh-ins were not saved',
      error,
      tone: 'critical',
    });
  });
}

export function ScaleWritesRow(): ReactNode {
  const state = useWriteState();
  const scale = useHasScale();
  if (!scale) {
    return null;
  }
  const subtitle =
    state.kind === 'ready'
      ? 'Saved after each weigh-in'
      : state.kind === 'needs_permission'
        ? `Needs permission · ${String(state.waiting)} waiting`
        : state.reason;
  return (
    <ListRow
      icon="scale"
      title="Save weigh-ins to Health Connect"
      subtitle={subtitle}
      subtitleTone={state.kind === 'ready' ? 'variant' : 'warning'}
      trailing={
        state.kind !== 'needs_permission' ? undefined : (
          <Button label="Allow" variant="tonal" onPress={allow} />
        )
      }
    />
  );
}
