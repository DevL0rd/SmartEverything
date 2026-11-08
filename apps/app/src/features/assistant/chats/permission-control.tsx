import type { ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessHost,
  type AiHarnessPermission,
  type AiHarnessPermissionChange,
  type AiHarnessSession,
  type AiPermissionPresets,
  type DshEngine,
  type Engine,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { AccessControl } from '../access/access-control';
import {
  applyingKey,
  harnessBlock,
  harnessChoice,
  type AccessBlock,
} from '../access/harness-access';
import { harnessModel } from '../access/harness-model';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
import { useRouteInfo } from '../data/route-info';
import { useOwnDeviceSelection } from '../data/own-device-selection';
import { harnessHostName, harnessHostReason } from '../model/harness-context';
import { isComputerEngine } from '../provider/computer-engine';
import { useSessionPermission } from '../provider/harness-session-permission';
import { NativePermissionControl } from './native-permission-control';
import { useEngineAccessory } from './engine-accessories';

const HUB = 'server';

function usePresets(engine: Engine): AiPermissionPresets | null {
  return useRouteInfo(engine).data?.permission_presets ?? null;
}

export function PermissionControl({
  engine,
  onChange,
  chat,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly chat?: AiChatRow;
}): ReactNode {
  const accessory = useEngineAccessory();
  if (isComputerEngine(engine))
    return (
      <NativePermissionControl
        engine={engine}
        onChange={onChange}
        {...(chat === undefined ? {} : { chat })}
      />
    );
  if (chat === undefined && accessory?.host.draft === true)
    return <DraftAccess engine={engine} onChange={onChange} />;
  if (chat !== undefined && engine.session_id !== null)
    return <SessionAccess chat={chat} engine={engine} />;
  return (
    <DraftAccess engine={engine} onChange={onChange} {...(chat === undefined ? {} : { chat })} />
  );
}

interface DraftContext {
  readonly engine: Engine;
  readonly key: string;
  readonly host: AiHarnessHost | undefined;
  readonly name: string;
  readonly presets: AiPermissionPresets | null;
  readonly permissions: readonly AiHarnessPermission[];
  readonly current: AiHarnessPermission;
  readonly accessory: ReturnType<typeof useEngineAccessory>;
  readonly resolve: ReturnType<typeof useOwnDeviceSelection>;
}

function draftKey(engine: Engine, accessory: ReturnType<typeof useEngineAccessory>): string {
  if (accessory?.host.draft === true) return accessory.host.key;
  return engine.kind === 'dsh' ? harnessTargetKey(engine.execution_target) : HUB;
}

function hostLabel(host: AiHarnessHost | undefined, key: string): string {
  return host?.name ?? (key === HUB ? 'Home hub' : 'this machine');
}

function useDraftContext(engine: Engine): DraftContext {
  const catalogue = useHarnessCatalogue();
  const accessory = useEngineAccessory();
  const resolve = useOwnDeviceSelection(engine);
  const presets = usePresets(engine);
  const key = draftKey(engine, accessory);
  const host = catalogue.data?.hosts.find((row) => harnessTargetKey(row.target) === key);
  return {
    engine,
    key,
    host,
    name: hostLabel(host, key),
    presets,
    permissions: host?.manifest?.permissions ?? [],
    current: engine.kind === 'dsh' ? engine.permission : DEFAULT_AI_HARNESS_PERMISSION,
    accessory,
    resolve,
  };
}

function draftBlock(context: DraftContext): AccessBlock | null {
  const { host, name } = context;
  return harnessBlock({
    host: name,
    unavailable: host === undefined ? `${name} is unavailable` : harnessHostReason(host),
    sessionReady: true,
    applying: false,
    waitingConfirm: false,
    switching: false,
    liveChange: true,
    bound: false,
    presets: context.presets !== null,
    choices: context.permissions.length,
  });
}

function draftEngine(
  context: DraftContext,
  host: AiHarnessHost,
  permission: AiHarnessPermission,
): Engine | null {
  const { accessory, engine, resolve } = context;
  if (accessory?.host.draft === true)
    return accessory.host.valid() ? resolve(host, true, permission) : null;
  return engine.kind === 'dsh' ? { ...engine, permission } : null;
}

function draftSelect(
  context: DraftContext,
  block: AccessBlock | null,
  onChange: (engine: Engine) => void,
): (sectionId: string, value: string) => void {
  return (_section, value): void => {
    const next = harnessChoice(context.permissions, context.current, value);
    if (next === null || context.host === undefined || block !== null) return;
    const chosen = draftEngine(context, context.host, next);
    if (chosen === null) return;
    onChange(chosen);
  };
}

function DraftAccess({
  engine,
  onChange,
  chat,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly chat?: AiChatRow;
}): ReactNode {
  const context = useDraftContext(engine);
  const owner = useIsOwner();
  const block = draftBlock(context);
  return (
    <AccessControl
      model={harnessModel({
        host: context.name,
        presets: context.presets,
        permissions: context.permissions,
        current: context.current,
        block,
        applying: null,
        memberNote: context.key === HUB && !owner,
        tools: chat ?? null,
        onCheck: null,
        select: draftSelect(context, block, onChange),
      })}
    />
  );
}

function SessionAccess({
  chat,
  engine,
}: {
  readonly chat: AiChatRow;
  readonly engine: DshEngine;
}): ReactNode {
  const query = useChatHarness(chat.id, true);
  const session = query.data;
  const target = session?.target ?? engine.execution_target;
  const control = useSessionPermission(chat.id, target, session?.permission_change ?? null);
  const catalogue = useHarnessCatalogue();
  const owner = useIsOwner();
  const presets = usePresets(engine);
  const name = control.host?.name ?? harnessHostName(target, catalogue.data);
  const access = sessionAccessOf({ session, control, name, presets, error: query.error?.message });
  return (
    <AccessControl
      model={harnessModel({
        ...access,
        host: name,
        presets,
        permissions: control.policies,
        current: session?.permission ?? engine.permission,
        memberNote: target.kind === 'server' && !owner,
        tools: chat,
      })}
    />
  );
}

function sessionAccessOf({
  session,
  control,
  name,
  presets,
  error,
}: {
  readonly session: AiHarnessSession | undefined;
  readonly control: SessionControl;
  readonly name: string;
  readonly presets: AiPermissionPresets | null;
  readonly error: string | undefined;
}): Pick<Parameters<typeof harnessModel>[0], 'block' | 'applying' | 'onCheck' | 'select'> {
  if (session === undefined) {
    return {
      block: checkingBlock(error),
      applying: null,
      onCheck: null,
      select: (): void => undefined,
    };
  }
  const block = boundBlock(session, control, name, presets);
  return {
    block,
    applying: applyingPermission(session, control),
    onCheck: retryPermission(control),
    select: boundSelect(session, control, block),
  };
}

function checkingBlock(error: string | undefined): AccessBlock {
  return { kind: 'blocked', icon: 'info', text: error ?? 'Checking current permissions…' };
}

type SessionControl = ReturnType<typeof useSessionPermission>;

function submitChange(control: SessionControl, change: AiHarnessPermissionChange): void {
  control.mutation.mutate(change, {
    onError: (error): void => {
      notify({ message: 'Couldn’t change access', error, tone: 'critical' });
    },
  });
}

function boundBlock(
  session: AiHarnessSession,
  control: SessionControl,
  name: string,
  presets: AiPermissionPresets | null,
): AccessBlock | null {
  return harnessBlock({
    host: name,
    unavailable: control.host?.online === true ? null : `${name} is offline`,
    sessionReady: session.epoch !== null,
    applying: control.mutation.isPending,
    waitingConfirm: control.pending !== null,
    switching: session.state === 'switching',
    liveChange: control.host?.manifest?.permission_change === true,
    bound: true,
    presets: presets !== null,
    choices: control.policies.length,
  });
}

function boundSelect(
  session: AiHarnessSession,
  control: SessionControl,
  block: AccessBlock | null,
): (sectionId: string, value: string) => void {
  return (_section, value): void => {
    const next = harnessChoice(control.policies, session.permission, value);
    if (next === null || block !== null || session.epoch === null) return;
    const change = { operation_id: randomUUID(), expected_epoch: session.epoch, permission: next };
    submitChange(control, change);
  };
}

function applyingPermission(session: AiHarnessSession, control: SessionControl): string | null {
  const { mutation } = control;
  return applyingKey(
    session.permission,
    mutation.isPending ? mutation.variables.permission : undefined,
  );
}

function retryPermission(control: SessionControl): (() => void) | null {
  const { pending } = control;
  return pending === null
    ? null
    : (): void => {
        submitChange(control, pending);
      };
}
