import { randomUUID } from 'expo-crypto';
import {
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessHost,
  type AiHarnessSession,
  type AiHarnessTarget,
  type AiHarnessCatalogue,
  type Engine,
} from '@smarteverything/domain';
import { useSyncStatus } from '../../../store/selectors';
import { notify } from '../../../components/toast-store';
import type { MenuItem } from '../../../components/menu';
import {
  useChatHarness,
  useHarnessCatalogue,
  useHarnessSwitch,
  useHarnessSupported,
} from './harness';
import { harnessHostName, harnessHostReason } from '../model/harness-context';
import {
  harnessDeviceIntent,
  harnessHandoffPolicyReason,
  harnessHandoffActive,
} from '../model/harness-handoff';
import { useOwnDeviceSelection } from './own-device-selection';
import { changeChat } from '../chats/chat-actions';

export function useHarnessDevice(chat: AiChatRow): {
  readonly name: string;
  readonly items: readonly MenuItem[];
} {
  const catalogue = useHarnessCatalogue();
  const state = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  const mutation = useHarnessSwitch(chat.id);
  const resolve = useOwnDeviceSelection(chat.engine);
  const connectionReason = useDeviceConnectionReason();
  const engine = chat.engine;
  const session = state.data;
  const target = session?.target ?? ownTarget(engine);
  const blocked =
    connectionReason ?? deviceSwitchReason(chat, session, state.error, catalogue.data);
  const items = deviceItems(catalogue.data?.hosts ?? [], {
    blocked,
    session,
    target,
    pending: mutation.isPending,
    resolve,
    bound: engine.kind === 'dsh',
    select: (host): void => {
      if (blocked === null) {
        selectDevice(chat, host, { session, mutation, resolve, catalogue: catalogue.data });
      }
    },
  });
  return {
    name: harnessHostName(target, catalogue.data),
    items,
  };
}

function ownTarget(engine: Engine): AiHarnessTarget {
  return engine.kind === 'dsh' ? engine.execution_target : { kind: 'server' };
}
function ownSessionId(engine: Engine): string | null {
  return engine.kind === 'dsh' ? engine.session_id : null;
}
function selectDevice(
  chat: AiChatRow,
  host: AiHarnessHost,
  context: {
    readonly session: AiHarnessSession | undefined;
    readonly mutation: ReturnType<typeof useHarnessSwitch>;
    readonly catalogue: AiHarnessCatalogue | undefined;
    readonly resolve: ReturnType<typeof useOwnDeviceSelection>;
  },
): boolean {
  const engine = context.resolve(host, true);
  if (engine === null || context.mutation.isPending) return false;
  if (engine.session_id === null) {
    void changeChat(chat.id, { engine });
    return true;
  }
  const session = context.session;
  const route = context.catalogue?.routes.find((row) => row.id === engine.model_route_id);
  if (session === undefined || route === undefined) return false;
  const intent = harnessDeviceIntent(
    session,
    host,
    route,
    sourceDisconnected(session, context.catalogue),
  );
  if (intent === null) return false;
  context.mutation.mutate(
    { ...intent, operation_id: randomUUID() },
    { onError: notifyDeviceSwitchError },
  );
  return true;
}

function deviceSwitchReason(
  chat: AiChatRow,
  session: AiHarnessSession | undefined,
  error: Error | null,
  catalogue: AiHarnessCatalogue | undefined,
): string | null {
  const sessionId = ownSessionId(chat.engine);
  if (sessionId === null) return null;
  if (error !== null) return 'Reconnect to confirm current work.';
  if (session === undefined) return 'Checking current work…';
  if (!deviceProjectionMatches(chat, session, sessionId))
    return 'Refresh the current device binding.';
  if (harnessHandoffActive(session)) return 'Device switch in progress.';
  if (!sourceDisconnected(session, catalogue) && session.handoff?.source_outcome === 'unknown')
    return 'Current work is unconfirmed.';
  return null;
}

function deviceProjectionMatches(
  chat: AiChatRow,
  session: AiHarnessSession,
  sessionId: string,
): boolean {
  return (
    session.chat_id === chat.id &&
    session.session_id === sessionId &&
    session.metadata.profile_id === chat.profile_id
  );
}

function deviceItems(
  hosts: readonly AiHarnessHost[],
  context: {
    readonly blocked: string | null;
    readonly bound: boolean;
    readonly session: AiHarnessSession | undefined;
    readonly target: AiHarnessTarget;
    readonly pending: boolean;
    readonly select: (host: AiHarnessHost) => void;
    readonly resolve: ReturnType<typeof useOwnDeviceSelection>;
  },
): readonly MenuItem[] {
  if (hosts.length === 0)
    return [
      {
        label: context.blocked ?? 'Checking available devices…',
        disabled: true,
        onPress: (): void => undefined,
      },
    ];
  return hosts.map((host) => {
    const { target, pending, select } = context;
    const reason = deviceItemReason(host, context);
    const current = context.bound && harnessTargetKey(host.target) === harnessTargetKey(target);
    let label = host.name;
    if (current) label += ' · Current';
    else if (reason !== null) label += ` · ${reason}`;
    return {
      label,
      icon: current ? 'check' : 'monitor',
      disabled: current || reason !== null || pending,
      onPress: (): void => {
        select(host);
      },
    };
  });
}

function deviceItemReason(
  host: AiHarnessHost,
  context: Parameters<typeof deviceItems>[1],
): string | null {
  const { blocked, session, resolve } = context;
  return (
    blocked ??
    harnessHostReason(host) ??
    (session === undefined ? null : harnessHandoffPolicyReason(session, host)) ??
    (resolve(host) === null ? 'Model or permissions unavailable.' : null)
  );
}

function useDeviceConnectionReason(): string | null {
  const supported = useHarnessSupported();
  const sync = useSyncStatus();
  if (sync.status !== 'live') return 'Reconnect to switch devices.';
  return supported ? null : 'Device switching is unavailable on this hub.';
}

function sourceDisconnected(
  session: AiHarnessSession,
  catalogue: AiHarnessCatalogue | undefined,
): boolean {
  const source = catalogue?.hosts.find(
    (host) => harnessTargetKey(host.target) === harnessTargetKey(session.target),
  );
  return source?.online !== true;
}

function notifyDeviceSwitchError(error: Error): void {
  notify({ message: 'Device switch did not finish', error, tone: 'critical' });
}
