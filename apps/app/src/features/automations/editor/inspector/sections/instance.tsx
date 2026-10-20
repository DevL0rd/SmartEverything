import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { ActionRow, SelectRow, ValueRow } from '../../../../../components/rows';
import { confirm } from '../../../../../components/confirm-store';
import { Segmented } from '../../../../../components/segmented';
import { List } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { useInstanceHost, type InstanceHost } from '../../../functions/edit/instance-host';
import {
  followOps,
  instanceState,
  pinOps,
  revisionChoices,
  type FollowMode,
  type InstanceState,
} from '../../../functions/edit/instance-model';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

const MODES = [
  { value: 'follow', label: 'Follow latest' },
  { value: 'pin', label: 'Pin to a version' },
] as const;

function Mode({
  state,
  disabled,
  onChange,
}: {
  readonly state: InstanceState;
  readonly disabled: boolean;
  readonly onChange: (mode: FollowMode) => void;
}): ReactNode {
  return (
    <View className="gap-2 px-4 py-2">
      <Segmented<FollowMode>
        label="Which version this step uses"
        fill
        disabled={disabled || state.locked}
        options={MODES}
        value={state.mode}
        onChange={onChange}
      />
      <Text variant="footnote" tone="variant">
        {state.summary}
      </Text>
    </View>
  );
}

async function detach(host: InstanceHost, key: string, name: string): Promise<void> {
  const accepted = await confirm({
    title: `Detach from ${name}?`,
    body: 'The steps are copied into this automation and no longer follow the Custom Node. Data it kept for this step starts again from its start value.',
    confirmLabel: 'Detach',
    tone: 'destructive',
  });
  if (accepted) await host.detach(key);
}

function Detach({ keyName, name }: { readonly keyName: string; readonly name: string }): ReactNode {
  const host = useInstanceHost();
  const [busy, setBusy] = useState(false);
  if (host === null) return null;
  return (
    <ActionRow
      title="Detach"
      subtitle="Copy the steps into this automation"
      icon="copy"
      destructive
      disabled={busy}
      onPress={() => {
        setBusy(true);
        background(
          detach(host, keyName, name).finally(() => {
            setBusy(false);
          }),
          'automations.instance.detach_failed',
        );
      }}
    />
  );
}

function UseElsewhere({ functionId }: { readonly functionId: string }): ReactNode {
  const host = useInstanceHost();
  if (host === null) return null;
  return (
    <ActionRow
      title="Use it elsewhere"
      subtitle="Find automations with the same steps"
      icon="search"
      onPress={() => {
        host.openSameSteps(functionId);
      }}
    />
  );
}

function PinRow({
  state,
  keyName,
  latest,
  locked,
  actions,
}: {
  readonly state: InstanceState;
  readonly keyName: string;
  readonly latest: number;
  readonly locked: boolean;
  readonly actions: SectionProps['actions'];
}): ReactNode {
  if (state.mode !== 'pin' || state.pinned === null) return null;
  return (
    <SelectRow
      title="Version"
      {...(state.behind
        ? { subtitle: `Update to version ${String(state.latest)} is available` }
        : {})}
      options={revisionChoices(latest)}
      value={String(state.pinned)}
      disabled={locked || state.locked}
      onChange={(value) => {
        actions.apply(pinOps(keyName, Number(value)));
      }}
    />
  );
}

export function Instance({ view, env, actions }: SectionProps): ReactNode {
  const node = flowNodeOf(view);
  const port = node?.ports?.['fn'];
  const id =
    port !== undefined && 'lit' in port && typeof port.lit === 'string' ? port.lit : undefined;
  const choice = id === undefined ? undefined : env.functions.get(id);
  if (node === undefined || choice === undefined) return null;
  const state = instanceState(node, choice.latest);
  const change = (mode: FollowMode): void => {
    actions.apply(mode === 'pin' ? pinOps(node.key, choice.latest) : followOps(node.key));
  };
  return (
    <List title="Custom Node">
      <ValueRow
        title={choice.name}
        subtitle={choice.interfaceLine}
        value={`Version ${String(choice.latest)}`}
      />
      <Mode state={state} disabled={env.locked} onChange={change} />
      <PinRow
        state={state}
        keyName={node.key}
        latest={choice.latest}
        locked={env.locked}
        actions={actions}
      />
      <UseElsewhere functionId={choice.id} />
      {env.locked ? null : <Detach keyName={node.key} name={choice.name} />}
    </List>
  );
}
