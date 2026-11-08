import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { ActionRow, SelectRow, ValueRow } from '../../../../../components/rows';
import { confirm } from '../../../../../components/confirm-store';
import { Segmented } from '../../../../../components/segmented';
import { List, Section } from '../../../../../components/section';
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
import { outputLabel } from '@smarteverything/domain';
import { controlOf } from '../schema-fields';
import { portOps } from './edits';
import { flowNodeOf } from './node-view';
import type { FunctionChoice, SectionProps } from './section-types';

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

async function detach(
  run: NonNullable<InstanceHost['detach']>,
  key: string,
  name: string,
): Promise<void> {
  const accepted = await confirm({
    title: `Detach from ${name}?`,
    body: 'The steps are copied into this automation and no longer follow the Custom Node. Data it kept for this step starts again from its start value.',
    confirmLabel: 'Detach',
    tone: 'destructive',
  });
  if (accepted) await run(key);
}

function Detach({ keyName, name }: { readonly keyName: string; readonly name: string }): ReactNode {
  const host = useInstanceHost();
  const [busy, setBusy] = useState(false);
  const run = host?.detach;
  if (run === undefined) return null;
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
          detach(run, keyName, name).finally(() => {
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
      title="Open the Custom Node"
      subtitle="See its steps and where else it is used"
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

function CallInputs({
  choice,
  section,
}: {
  readonly choice: FunctionChoice;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  if (choice.inputs.length === 0) return null;
  return (
    <Section title="Inputs">
      <View className="gap-5 py-2">
        {choice.inputs.map((input) => {
          const title = input.label ?? outputLabel(input.name);
          return (
            <View key={input.name} className="px-4">
              {env.renderValue({
                nodeKey: view.key,
                slot: input.name,
                label: title,
                helper: input.description,
                type: input.type,
                control: controlOf(input.type),
                isStatic: false,
                required: input.required,
                value: view.node.ports?.[input.name],
                message: env.findings.find((found) => found.port === input.name)?.message,
                heading: (
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text variant="body-strong">{title}</Text>
                    {input.description === undefined ? null : (
                      <Text variant="footnote" tone="variant">
                        {input.description}
                      </Text>
                    )}
                  </View>
                ),
                onChange: (value) => {
                  actions.apply(portOps(view.key, input.name, value));
                },
              })}
            </View>
          );
        })}
      </View>
    </Section>
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
  const list = (
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
  return (
    <>
      {list}
      <CallInputs choice={choice} section={{ view, env, actions }} />
    </>
  );
}
