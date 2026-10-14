import { useCommandTransient, openCommandPicker } from '../commands/transient';
import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessSession,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type Engine,
} from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { arrangeEntries, MenuRows } from '../../../components/menu-rows';
import { Popover } from '../../../components/popover';
import { type Rect } from '../../../components/anchor';
import { useIdiom } from '../../../design/platform';
import { CompactPickerControl } from '../components/compact-picker-control';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
import { useHarnessPermission, permissionKey } from '../provider/harness-permission';
import { harnessPermissionLabel, harnessPermissionLevel } from '../provider/permission-labels';
import {
  useSessionPermission,
  changeSessionPermission,
} from '../provider/harness-session-permission';
import { NativePermissionControl } from './native-permission-control';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineAccessory } from './engine-accessories';
import { useOwnDeviceSelection } from '../data/own-device-selection';
import { harnessHostReason } from '../model/harness-context';

export function PermissionPill({
  label,
  items,
  unrestricted = false,
  shortLabel = label,
  nextTurn = false,
}: {
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly unrestricted?: boolean;
  readonly shortLabel?: string;
  readonly nextTurn?: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const pointer = useIdiom() === 'pointer';
  const close = (): void => {
    setAnchor(null);
  };
  const dismissCommands = useCommandTransient(close);
  return (
    <>
      <CompactPickerControl
        anchorRef={ref}
        label={`Permissions: ${label}`}
        value={shortLabel}
        pending={nextTurn}
        icon="shield"
        unrestricted={unrestricted}
        onPress={(): void => {
          openCommandPicker(dismissCommands, ref, setAnchor);
        }}
      />
      <Popover
        open={anchor !== null}
        onClose={close}
        anchor={anchor}
        label="Permissions"
        placement="above"
        width={320}
      >
        <MenuRows
          entries={arrangeEntries([], items)}
          close={close}
          layout={pointer ? 'popover' : 'touch-popover'}
        />
      </Popover>
    </>
  );
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
    return <DraftPermissionControl engine={engine} onChange={onChange} />;
  if (engine.kind !== 'dsh')
    return (
      <PermissionPill
        label="Tool grants"
        shortLabel="Tools"
        items={[
          {
            label: 'This cloud engine uses this chat’s existing tool grants.',
            disabled: true,
            onPress: (): void => undefined,
          },
        ]}
      />
    );
  if (chat !== undefined && engine.session_id !== null)
    return <SessionPermissionControl chat={chat} engine={engine} />;
  return <DraftPermissionControl engine={engine} onChange={onChange} />;
}
function DraftPermissionControl({
  engine,
  onChange,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  const catalogue = useHarnessCatalogue();
  const accessory = useEngineAccessory();
  const target = engine.kind === 'dsh' ? harnessTargetKey(engine.execution_target) : 'server';
  const key = accessory?.host.draft === true ? accessory.host.key : target;
  const host = draftPermissionHost(catalogue.data, key);
  const permission = engine.kind === 'dsh' ? engine.permission : DEFAULT_AI_HARNESS_PERMISSION;
  const control = useHarnessPermission(host, permission);
  const resolve = useOwnDeviceSelection(engine);
  const items = control.policies.map((policy): MenuItem => ({
    label: harnessPermissionLabel(policy),
    icon: permissionKey(policy) === permissionKey(permission) ? 'check' : 'shield',
    disabled: host?.online !== true,
    onPress: (): void => {
      if (host === undefined) return;
      if (accessory?.host.draft === true) {
        if (!accessory.host.valid()) return;
        const selected = resolve(host, true, policy);
        if (selected !== null) onChange(selected);
      } else if (engine.kind === 'dsh' && host.online) onChange({ ...engine, permission: policy });
    },
  }));
  if (key === 'server') items.push(hubRestriction());
  if (items.length === 0)
    items.push({
      label: 'Permissions unavailable on this device.',
      disabled: true,
      onPress: (): void => undefined,
    });
  return (
    <PermissionPill
      label={harnessPermissionLabel(permission)}
      items={items}
      unrestricted={permission.sandbox === 'danger-full-access'}
      shortLabel={harnessPermissionLevel(permission)}
    />
  );
}
function draftPermissionHost(
  catalogue: AiHarnessCatalogue | undefined,
  key: string,
): AiHarnessHost | undefined {
  const host = catalogue?.hosts.find((row) => harnessTargetKey(row.target) === key);
  return host !== undefined && harnessHostReason(host) === null ? host : undefined;
}

function SessionPermissionControl({
  chat,
  engine,
}: {
  readonly chat: AiChatRow;
  readonly engine: Extract<Engine, { kind: 'dsh' }>;
}): ReactNode {
  const query = useChatHarness(chat.id, true);
  if (query.data === undefined)
    return (
      <PermissionPill
        label={harnessPermissionLabel(engine.permission)}
        items={[
          {
            label: query.error?.message ?? 'Checking current permissions…',
            disabled: true,
            onPress: (): void => undefined,
          },
        ]}
      />
    );
  return <BoundPermissionControl session={query.data} />;
}
function BoundPermissionControl({ session }: { readonly session: AiHarnessSession }): ReactNode {
  const control = useSessionPermission(session);
  const items = control.policies.map((permission): MenuItem => ({
    label: harnessPermissionLabel(permission),
    icon: permissionKey(permission) === permissionKey(session.permission) ? 'check' : 'shield',
    disabled: control.disabled,
    onPress: (): void => {
      changeSessionPermission(session, control, permissionKey(permission));
    },
  }));
  if (control.pending !== null) {
    const pending = control.pending;
    items.push({
      label: 'Confirm pending permission change',
      disabled: control.mutation.isPending,
      onPress: (): void => {
        control.mutation.mutate(pending);
      },
    });
  }
  if (control.mutation.error !== null)
    items.push({
      label: control.mutation.error.message,
      disabled: true,
      onPress: (): void => undefined,
    });
  if (session.target.kind === 'server') items.push(hubRestriction());
  return (
    <PermissionPill
      label={harnessPermissionLabel(session.permission)}
      items={items}
      unrestricted={session.permission.sandbox === 'danger-full-access'}
      shortLabel={harnessPermissionLevel(session.permission)}
    />
  );
}
function hubRestriction(): MenuItem {
  return {
    label: 'Home hub files, shell and system tools stay unavailable.',
    disabled: true,
    onPress: (): void => undefined,
  };
}
