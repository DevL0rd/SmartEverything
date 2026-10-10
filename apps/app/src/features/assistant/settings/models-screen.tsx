import type { ReactNode } from 'react';
import { useState } from 'react';
import type { HeaderAction } from '../../../components/page-header';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useOpenRouterActions } from '../data/openrouter';
import { ModelBrowser } from '../picker/model-browser';

const MODELS_PAGE = 'assistant/models';

function useRefreshAction(): HeaderAction | null {
  const owner = useIsOwner();
  const { refresh } = useOpenRouterActions();
  const [busy, setBusy] = useState(false);
  if (!owner) {
    return null;
  }
  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      const sync = await refresh();
      notify({
        message: 'Models updated',
        detail: `${String(sync.added)} new, ${String(sync.repriced)} new prices`,
        tone: 'positive',
      });
    } catch (error) {
      notify({ message: 'Couldn’t update the models', error });
    } finally {
      setBusy(false);
    }
  };
  return {
    icon: busy ? 'loader' : 'refresh',
    label: busy ? 'Updating' : 'Refresh',
    iconOnly: true,
    onPress: (): void => {
      if (!busy) {
        void run();
      }
    },
  };
}

export function ModelsScreen(): ReactNode {
  const refresh = useRefreshAction();
  return (
    <SettingsFrame page={MODELS_PAGE} scroll={false} actions={refresh === null ? [] : [refresh]}>
      <ModelBrowser />
    </SettingsFrame>
  );
}
