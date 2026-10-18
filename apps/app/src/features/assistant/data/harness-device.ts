import { randomUUID } from 'expo-crypto';
import {
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessHandoffRequest,
  type AiHarnessHost,
  type AiHarnessSession,
  type AiHarnessTarget,
  type AiHarnessCatalogue,
  type Engine,
} from '@smarteverything/domain';
import { useSyncStatus } from '../../../store/selectors';
import { notify } from '../../../components/toast-store';
import type { MenuItem } from '../../../components/menu';
import { useChatHarness, useHarnessCatalogue, useHarnessSwitch } from './harness';
import { harnessHostName, harnessHostReason } from '../model/harness-context';
import {
  harnessHandoffPolicyReason,
  machineSwitchNotice,
  machineSwitchOf,
  machineSwitchRequest,
} from '../model/harness-handoff';
import { useOwnDeviceSelection } from './own-device-selection';
import { changeChat } from '../chats/chat-actions';
import { background } from '@smarteverything/logging';

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
  const target = ownTarget(engine);
  const blocked = connectionReason ?? deviceSwitchReason(chat, state.data);
  const items = deviceItems(catalogue.data?.hosts ?? [], {
    blocked,
    session: state.data,
    target,
    pending: mutation.isPending,
    resolve,
    bound: engine.kind === 'dsh',
    select: (host): void => {
      if (blocked === null) {
        selectDevice(chat, host, {
          session: state.data,
          mutation,
          resolve,
          catalogue: catalogue.data,
        });
      }
    },
  });
  return {
    name: harnessHostName(target, catalogue.data),
    items,
  };
}

export function useCancelMachineSwitch(chat: AiChatRow): (() => void) | null {
  const catalogue = useHarnessCatalogue();
  const session = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  const mutation = useHarnessSwitch(chat.id);
  const engine = chat.engine;
  const route =
    engine.kind === 'dsh'
      ? catalogue.data?.routes.find((row) => row.id === engine.model_route_id)
      : undefined;
  if (
    engine.kind !== 'dsh' ||
    route === undefined ||
    machineSwitchOf(chat.pending_execution_target).kind === 'idle'
  ) {
    return null;
  }
  return (): void => {
    const request = machineSwitchRequest({
      engine,
      route,
      session: session.data,
      operationId: randomUUID(),
    });
    submitMachineSwitch(
      mutation,
      request,
      harnessHostName(engine.execution_target, catalogue.data),
    );
  };
}

function ownTarget(engine: Engine): AiHarnessTarget {
  return engine.kind === 'dsh' ? engine.execution_target : { kind: 'server' };
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
): void {
  const engine = context.resolve(host, true);
  if (engine === null || context.mutation.isPending) return;
  if (engine.session_id === null) {
    background(changeChat(chat.id, { engine }), 'chat.change_failed');
    return;
  }
  const route = context.catalogue?.routes.find((row) => row.id === engine.model_route_id);
  if (route === undefined) return;
  const request = machineSwitchRequest({
    engine,
    route,
    session: context.session,
    operationId: randomUUID(),
  });
  submitMachineSwitch(context.mutation, request, host.name);
}

function submitMachineSwitch(
  mutation: ReturnType<typeof useHarnessSwitch>,
  request: AiHarnessHandoffRequest,
  machine: string,
): void {
  mutation.mutate(request, {
    onSuccess: (result): void => {
      const notice = machineSwitchNotice(result, machine);
      if (notice !== null) notify({ ...notice, tone: 'positive' });
    },
    onError: (error): void => {
      notify({
        message: 'Machine not changed',
        error,
        tone: 'critical',
        action: {
          label: 'Try again',
          onPress: (): void => {
            submitMachineSwitch(mutation, request, machine);
          },
        },
      });
    },
  });
}

function deviceSwitchReason(chat: AiChatRow, session: AiHarnessSession | undefined): string | null {
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null) return null;
  return session === undefined ? 'Checking current work…' : null;
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
        label: context.blocked ?? 'Checking available machines…',
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
  const sync = useSyncStatus();
  return sync.status === 'live' ? null : 'Reconnect to switch machines.';
}
