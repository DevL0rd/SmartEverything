import {
  receiveTranscriptNotice,
  refreshTranscriptReaders,
  transcriptCameraChanges,
} from '../queries/transcript-notices';
import { receivePreviewNotice } from '../queries/preview-notices';
import { HarnessNotices } from '../queries/harness-notices';
import { CodexProviderNotices } from '../queries/codex-provider-notices';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  EVENT_KIND_LABELS,
  isUrgent,
  type LiveChange,
  type LiveMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ServerConnection } from '../api/transport';
import { routeFor } from '../api/connection/active-route';
import { appPlatform, desktopBridge } from '../design/platform';
import { applyToWindows, refreshAllWindows } from '../queries/live-invalidations';
import { ProviderNotices } from '../queries/provider-notices';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import { LiveSync } from './live-sync';
import { persistSnapshots, restoreSnapshot } from './persistence';
import { StoreProvider, type StoreRuntime } from './store-context';
import {
  clearImageSession,
  clearUploads,
  forgetOlderMessages,
  IMAGE_QUERY_PREFIX,
  receiveImageNotice,
  refreshImageOperations,
  reconcileImageMessages,
} from '../features/assistant';

const log = new Logger('app.store');

function clearAssistantSession(): void {
  clearImageSession();
  clearUploads();
  forgetOlderMessages();
}

function followAppState(sync: LiveSync, client: QueryClient): () => void {
  if (appPlatform() !== 'android') {
    const focus = (): void => {
      sync.refresh();
    };
    window.addEventListener('focus', focus);
    return (): void => {
      window.removeEventListener('focus', focus);
    };
  }
  const apply = (state: string): void => {
    if (state === 'background') {
      sync.suspend();
    } else if (state === 'active') {
      if (sync.resume()) refreshAllWindows(client);
      else sync.refresh();
    }
  };
  apply(AppState.currentState);
  const subscription = AppState.addEventListener('change', apply);
  return (): void => {
    subscription.remove();
  };
}

function notifyDesktop(store: EntityStore, changes: readonly LiveChange[]): void {
  const bridge = desktopBridge();
  if (bridge === null) {
    return;
  }
  for (const change of changes) {
    if (
      change.table === 'events' &&
      change.operation === 'INSERT' &&
      change.record !== null &&
      isUrgent(change.record.kind)
    ) {
      const device =
        change.record.device_id === null
          ? undefined
          : store.get().tables.devices.byId[change.record.device_id];
      bridge
        .notify({
          title: EVENT_KIND_LABELS[change.record.kind],
          body: device?.label ?? 'Your home',
        })
        .catch((error: unknown) => {
          log.error('desktop.notify_failed', error);
        });
    }
  }
}

interface Runtime extends StoreRuntime {
  readonly start: () => () => void;
}

function computerNotice(
  client: QueryClient,
  message: Extract<
    LiveMessage,
    {
      type:
        | 'computer_ai_status'
        | 'computer_claude'
        | 'computer_runtime_status'
        | 'computer_runtime_native';
    }
  >,
): void {
  if (message.type === 'computer_runtime_status' || message.type === 'computer_runtime_native') {
    const deviceId =
      message.type === 'computer_runtime_status' ? message.status.device_id : message.device_id;
    void client.invalidateQueries({ queryKey: ['window', 'computer-runtime', deviceId] });
    void client.invalidateQueries({ queryKey: ['window', 'ai-engines'] });
    return;
  }
  const deviceId =
    message.type === 'computer_ai_status' ? message.status.device_id : message.device_id;
  const key = ['window', 'computer-ai', deviceId];
  if (message.type === 'computer_claude' && message.notice.type === 'claude_operation') {
    const operation = message.notice.operation;
    client.setQueryData([...key, 'operation', operation.id], operation);
    if (operation.state === 'pending' || operation.state === 'uncertain') return;
  }
  if (message.type === 'computer_ai_status') {
    client.setQueryData([...key, 'status'], message.status);
    void client.invalidateQueries({ queryKey: ['window', 'ai-engines'] });
  }
  void client.invalidateQueries({ queryKey: key });
}

function runtimeOf(connection: ServerConnection, client: QueryClient): Runtime {
  const store = new EntityStore();
  const providers = new ProviderNotices(client);
  const codex = new CodexProviderNotices(client);
  const harness = new HarnessNotices(client);
  const ledger = new CommandLedger(store);
  const sync = new LiveSync(connection, store, {
    onChanges: (changes): void => {
      ledger.noteChanges(changes);
      applyToWindows(client, changes);
      transcriptCameraChanges(client, changes);
      reconcileImageMessages(client, changes);
      notifyDesktop(store, changes);
    },
    onTranscriptNotice: receiveTranscriptNotice.bind(null, client),
    onAiProviderNotice: (message): void => {
      if (message.type === 'ai_chat_runtime_provider') codex.receive(message);
      else providers.receive(message);
    },
    onImageNotice: (message): void => {
      receiveImageNotice(client, store.get().session?.client.profile_id ?? null, message);
    },
    onAiHarnessConfigurationNotice: harness.configurationChanged.bind(harness),
    onAiPreviewNotice: (message): void => {
      receivePreviewNotice(client, message);
    },
    onAiHarnessNotice: (message): void => {
      harness.receive(message);
    },
    onComputerNotice: (message): void => {
      computerNotice(client, message);
    },
    onProfileChanged: (): void => {
      routeFor(connection).invalidate();
      clearAssistantSession();
      harness.clear();
      providers.clear();
      codex.clear();
      client.removeQueries();
    },
    onSynchronized: (): void => {
      harness.synchronized();
      refreshTranscriptReaders(client);
      refreshImageOperations(client);
    },
  });
  const start = (): (() => void) =>
    startRuntime({ connection, client, store, sync, ledger, providers, codex, harness });
  return { store, ledger, start };
}

export function HomeStore({
  connection,
  children,
}: {
  readonly connection: ServerConnection;
  readonly children: ReactNode;
}): ReactNode {
  const client = useQueryClient();
  const [runtime] = useState(() => runtimeOf(connection, client));
  useEffect(() => runtime.start(), [runtime]);
  return <StoreProvider runtime={runtime}>{children}</StoreProvider>;
}

interface RuntimeStartup {
  readonly connection: ServerConnection;
  readonly client: QueryClient;
  readonly store: EntityStore;
  readonly sync: LiveSync;
  readonly ledger: CommandLedger;
  readonly providers: ProviderNotices;
  readonly codex: CodexProviderNotices;
  readonly harness: HarnessNotices;
}
function startRuntime(ports: RuntimeStartup): () => void {
  const { connection, client, store, sync, ledger, providers, codex, harness } = ports;
  clearAssistantSession();
  client.removeQueries({ queryKey: IMAGE_QUERY_PREFIX });
  harness.start();
  providers.start();
  codex.start();
  const snapshotScope = `${connection.url} ${connection.token}`;
  restoreSnapshot(snapshotScope, store).catch((error: unknown) => {
    log.warn('snapshot.restore_failed', { reason: String(error) });
  });
  sync.start();
  const following = followAppState(sync, client);
  const persisting = persistSnapshots(snapshotScope, store);
  const online = onlineManager.subscribe((isOnline) => {
    if (isOnline) {
      sync.online();
    }
  });
  return (): void => {
    online();
    following();
    persisting();
    sync.stop();
    clearAssistantSession();
    client.removeQueries({ queryKey: IMAGE_QUERY_PREFIX });
    ledger.stop();
    harness.stop();
    providers.stop();
    codex.stop();
  };
}
