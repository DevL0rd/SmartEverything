import { Logger } from '@smarteverything/logging';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
  type HarnessExtensionPatch,
  type JsonValue,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { EXTENSIONS_KEY, EXTENSION_CONFIGURATION_KEY } from '../../../queries/extension-keys';
import { patched } from './items';

const log = new Logger('app.extensions');

const CHANGE_KEY = ['ai-harness-extension-change'] as const;

interface Change {
  readonly item: HarnessExtensionItem;
  readonly patch: HarnessExtensionPatch;
}

export interface ExtensionActions {
  readonly allowed: boolean;
  readonly setEnabled: (item: HarnessExtensionItem, enabled: boolean) => void;
  readonly setSetting: (item: HarnessExtensionItem, key: string, value: JsonValue) => void;
  readonly confirmExecutes: (item: HarnessExtensionItem) => void;
  readonly remove: (item: HarnessExtensionItem) => Promise<boolean>;
}

function useRefreshWhenIdle(): () => Promise<unknown> {
  const client = useQueryClient();
  return () =>
    client.isMutating({ mutationKey: CHANGE_KEY }) > 1
      ? Promise.resolve()
      : Promise.all([
          client.invalidateQueries({ queryKey: EXTENSIONS_KEY }),
          client.invalidateQueries({ queryKey: EXTENSION_CONFIGURATION_KEY }),
        ]);
}

function useChangeMutation(): (item: HarnessExtensionItem, patch: HarnessExtensionPatch) => void {
  const client = useQueryClient();
  const refresh = useRefreshWhenIdle();
  const change = useMutation({
    mutationKey: CHANGE_KEY,
    mutationFn: ({ item, patch }: Change) => {
      log.info('extension.change_started', {
        extensionId: item.id,
        fields: Object.keys(patch).join(','),
      });
      return api().call(E.changeAiHarnessExtension, { params: { id: item.id }, body: patch });
    },
    onSuccess: (_result, { item }) => {
      log.info('extension.change_succeeded', { extensionId: item.id });
    },
    onMutate: async ({ item, patch }) => {
      await client.cancelQueries({ queryKey: EXTENSIONS_KEY });
      client.setQueryData<AiHarnessExtensions>(EXTENSIONS_KEY, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              items: current.items.map((entry) =>
                entry.id === item.id ? patched(entry, patch) : entry,
              ),
            },
      );
    },
    onError: (error, { item }) => {
      log.error('extension.change_failed', error, { extensionId: item.id });
      notify({ message: `Couldn’t change ${item.name}`, error, tone: 'critical' });
    },
    onSettled: refresh,
  });
  return (item, patch) => {
    change.mutate({ item, patch });
  };
}

function useRemoveMutation(): (item: HarnessExtensionItem) => Promise<boolean> {
  const refresh = useRefreshWhenIdle();
  const removal = useMutation({
    mutationFn: (item: HarnessExtensionItem) => {
      log.info('extension.remove_started', { extensionId: item.id });
      return api().call(E.removeAiHarnessExtension, { params: { id: item.id } });
    },
    onSuccess: (_result, item) => {
      log.info('extension.remove_succeeded', { extensionId: item.id });
    },
    onError: (error, item) => {
      log.error('extension.remove_failed', error, { extensionId: item.id });
      notify({ message: `Couldn’t remove ${item.name}`, error, tone: 'critical' });
    },
    onSettled: refresh,
  });
  return (item) =>
    removal.mutateAsync(item).then(
      () => true,
      () => false,
    );
}

export function useExtensionActions(): ExtensionActions {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const apply = useChangeMutation();
  const remove = useRemoveMutation();
  return {
    allowed: owner && live,
    setEnabled: (item: HarnessExtensionItem, enabled: boolean): void => {
      apply(item, { enabled });
    },
    setSetting: (item: HarnessExtensionItem, key: string, value: JsonValue): void => {
      apply(item, { config: { ...item.config, [key]: value } });
    },
    confirmExecutes: (item: HarnessExtensionItem): void => {
      apply(item, { confirm_executes: true });
    },
    remove,
  };
}
