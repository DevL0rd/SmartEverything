import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SCOPE_NAME } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { SelectRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { CommittedField } from './committed-field';
import { portOps } from './edits';
import { RowActions } from './row-controls';
import type { SectionProps } from './section-types';

const JOIN_LABELS: Readonly<Record<string, string>> = {
  all: 'Wait for all',
  first: 'Wait for first',
  settled: 'Wait, ignore failures',
};

const ERROR_LABELS: Readonly<Record<string, string>> = {
  failFast: 'Stop all',
  settle: 'Keep going',
};

function literalId(node: FlowNode, port: string, fallback: string): string {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value && typeof value.lit === 'string'
    ? value.lit
    : fallback;
}

function nextBranchName(names: readonly string[]): string {
  let number = names.length + 1;
  while (names.includes(`branch${String(number)}`)) number += 1;
  return `branch${String(number)}`;
}

function BranchName({
  section,
  names,
  name,
}: {
  readonly section: SectionProps;
  readonly names: readonly string[];
  readonly name: string;
}): ReactNode {
  const { view, env, actions } = section;
  const index = names.indexOf(name);
  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <CommittedField
          label={`Branch ${String(index + 1)}`}
          value={name}
          disabled={env.locked}
          validate={(text) => {
            if (text === name) return undefined;
            if (!SCOPE_NAME.safeParse(text).success)
              return 'Use letters and numbers, starting with a letter.';
            return names.includes(text) ? 'A branch with that name exists.' : undefined;
          }}
          onCommit={(to) => {
            actions.editRows(view.key, [{ t: 'scope.rename', from: name, to }]);
          }}
        />
      </View>
      <RowActions
        noun={`branch ${name}`}
        index={index}
        count={names.length}
        disabled={env.locked}
        canRemove={names.length > (view.kind?.scopes?.minimum ?? 0)}
        onRemove={() => {
          actions.editRows(view.key, [{ t: 'scope.remove', name }]);
        }}
      />
    </View>
  );
}

export function ParallelRows({
  section,
  node,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { view, env, actions } = section;
  const names = Object.keys(node.scopes ?? {});
  return (
    <Section title="Do together">
      <List>
        <SelectRow
          title="Finishes when"
          value={literalId(node, 'join', 'all')}
          disabled={env.locked}
          options={Object.entries(JOIN_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(id) => {
            actions.apply(portOps(view.key, 'join', { lit: id }));
          }}
        />
      </List>
      <View className="gap-3 px-4 py-3">
        <Segmented
          label="If one branch fails"
          options={Object.entries(ERROR_LABELS).map(([value, label]) => ({ value, label }))}
          value={literalId(node, 'errors', 'failFast')}
          disabled={env.locked}
          onChange={(id) => {
            actions.apply(portOps(view.key, 'errors', { lit: id }));
          }}
        />
        {names.map((name) => (
          <BranchName key={name} section={section} names={names} name={name} />
        ))}
        <Button
          label="Add a branch"
          icon="plus"
          variant="tonal"
          disabled={env.locked}
          onPress={() => {
            actions.editRows(view.key, [{ t: 'scope.add', name: nextBranchName(names) }]);
          }}
        />
      </View>
    </Section>
  );
}
