import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import {
  ApiError,
  API_ENDPOINTS as E,
  type HarnessDesiredConfiguration,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useEntityStore } from '../../../store/store-context';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { notify } from '../../../components/toast-store';
import { friendlyError } from '../../../format/errors';
import { applyExtensionChange, type ExtensionChange } from './selection';
import { EXTENSIONS_KEY, EXTENSION_CONFIGURATION_KEY, readExtensionConfiguration } from './queries';

const log = new Logger('app.ai-extensions');
export type ExtensionChangeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'problem'; readonly message: string }
  | {
      readonly kind: 'review';
      readonly change: ExtensionChange;
      readonly before: HarnessDesiredConfiguration;
      readonly current: HarnessDesiredConfiguration;
      readonly message: string;
      readonly title: string;
    };

type SaveResult =
  | { readonly kind: 'saved' }
  | {
      readonly kind: 'review';
      readonly current: HarnessDesiredConfiguration;
      readonly title: string;
    };

async function saveChange(
  before: HarnessDesiredConfiguration,
  change: ExtensionChange,
): Promise<SaveResult> {
  const configuration = applyExtensionChange(before, change, Crypto.randomUUID());
  try {
    await api().call(E.replaceAiHarnessConfiguration, {
      body: { expected_revision: before.revision, configuration },
    });
    return { kind: 'saved' };
  } catch (error) {
    const readback = await readExtensionConfiguration();
    if (readback.desired.revision === configuration.revision) return { kind: 'saved' };
    if (error instanceof ApiError && error.code !== 'conflict') throw error;
    return {
      kind: 'review',
      current: readback.desired,
      title:
        error instanceof ApiError
          ? 'Extensions changed on another device'
          : 'Couldn’t confirm the change',
    };
  }
}

interface ExtensionWriter {
  readonly state: ExtensionChangeState;
  readonly allowed: boolean;
  readonly save: (change: ExtensionChange, before: HarnessDesiredConfiguration) => Promise<void>;
  readonly dismiss: () => void;
}

export function useExtensionWriter(): ExtensionWriter {
  const [state, setState] = useState<ExtensionChangeState>({ kind: 'idle' });
  const busy = useRef(false);
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const client = useQueryClient();
  const store = useEntityStore();
  const allowed = owner && sync.status === 'live' && state.kind !== 'busy';
  const save = async (
    change: ExtensionChange,
    before: HarnessDesiredConfiguration,
  ): Promise<void> => {
    if (
      busy.current ||
      store.get().sync.status !== 'live' ||
      store.get().session?.client.role !== 'owner'
    )
      return;
    busy.current = true;
    setState({ kind: 'busy' });
    try {
      const result = await saveChange(before, change);
      await Promise.all([
        client.invalidateQueries({ queryKey: EXTENSIONS_KEY }),
        client.invalidateQueries({ queryKey: EXTENSION_CONFIGURATION_KEY }),
      ]);
      setState(resultState(result, change, before));
    } catch (error) {
      log.warn('selection.save_unconfirmed', { error });
      setState({
        kind: 'problem',
        message:
          friendlyError(error) ??
          'Couldn’t confirm the change. Refresh the selection before trying again.',
      });
    } finally {
      busy.current = false;
    }
  };
  return {
    state,
    allowed,
    save,
    dismiss: (): void => {
      setState({ kind: 'idle' });
    },
  };
}

function resultState(
  result: SaveResult,
  change: ExtensionChange,
  before: HarnessDesiredConfiguration,
): ExtensionChangeState {
  if (result.kind === 'review')
    return {
      kind: 'review',
      change,
      before,
      current: result.current,
      message: 'Review the current selection before applying your change.',
      title: result.title,
    };
  notify({
    message: 'Saved. Compatible devices will apply the choice automatically.',
    tone: 'positive',
  });
  return { kind: 'idle' };
}
