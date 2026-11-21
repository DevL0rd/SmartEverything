import { Logger, background } from '@smarteverything/logging';
import { useState } from 'react';
import { notify } from '../../../../components/toast-store';
import { useIsOwner } from '../../../../store/selectors';
import { useOpenRouterActions } from '../../data/openrouter';

const log = new Logger('app.models');
export interface ModelsRefresh {
  readonly busy: boolean;
  readonly run: () => void;
}

async function refreshModels(
  refresh: ReturnType<typeof useOpenRouterActions>['refresh'],
  setBusy: (busy: boolean) => void,
): Promise<void> {
  setBusy(true);
  const operation = log.operation('models.refresh');
  try {
    const sync = await refresh();
    operation.succeeded({ added: sync.added, repriced: sync.repriced });
    notify({
      message: 'Models updated',
      detail: `${String(sync.added)} new, ${String(sync.repriced)} new prices`,
      tone: 'positive',
    });
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Couldn’t update the models', error });
  } finally {
    setBusy(false);
  }
}

export function useModelsRefresh(): ModelsRefresh | null {
  const owner = useIsOwner();
  const { refresh } = useOpenRouterActions();
  const [busy, setBusy] = useState(false);
  if (!owner) return null;
  return {
    busy,
    run: (): void => {
      if (!busy) background(refreshModels(refresh, setBusy), 'library_refresh.run_failed');
    },
  };
}
