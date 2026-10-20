import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FlowNode, SwitchMatch } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { SwitchRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { CommittedField } from './committed-field';
import { portOps } from './edits';
import type { MatchType, RangeDraft } from './match-model';
import {
  MATCH_TYPES,
  caseChoices,
  convertMatch,
  matchTypeOf,
  parseValue,
  parseValues,
  rangeDraft,
  rangeMatch,
  valueText,
} from './match-model';
import { RowActions, RowTitle, newRowId } from './row-controls';
import type { SectionProps } from './section-types';

interface CaseProps {
  readonly section: SectionProps;
  readonly id: string;
  readonly match: SwitchMatch;
}

function RangeFields({ section, id, match }: CaseProps): ReactNode {
  const { view, env, actions } = section;
  const draft = rangeDraft(match);
  const commit = (next: RangeDraft): void => {
    const result = rangeMatch(next);
    if (result.ok) actions.editRows(view.key, [{ t: 'case.match', id, match: result.match }]);
  };
  const problem = (text: RangeDraft): string | undefined => {
    const result = rangeMatch(text);
    return result.ok ? undefined : result.reason;
  };
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <CommittedField
          label="From"
          kind="number"
          value={draft.min}
          disabled={env.locked}
          validate={(text) => problem({ ...draft, min: text })}
          onCommit={(min) => {
            commit({ ...draft, min });
          }}
        />
      </View>
      <View className="flex-1">
        <CommittedField
          label="To"
          kind="number"
          value={draft.max}
          disabled={env.locked}
          validate={(text) => problem({ ...draft, max: text })}
          onCommit={(max) => {
            commit({ ...draft, max });
          }}
        />
      </View>
    </View>
  );
}

function MatchValue({ section, id, match }: CaseProps): ReactNode {
  const { view, env, actions } = section;
  const set = (next: SwitchMatch): void => {
    actions.editRows(view.key, [{ t: 'case.match', id, match: next }]);
  };
  if ('range' in match) return <RangeFields section={section} id={id} match={match} />;
  if ('when' in match) {
    return env.renderValue({
      nodeKey: view.key,
      slot: `case:${id}`,
      label: 'Condition',
      helper: undefined,
      type: { t: 'boolean' },
      control: { t: 'switch' },
      isStatic: false,
      required: true,
      value: match.when,
      message: undefined,
      onChange: (value) => {
        if (value !== null) set({ when: value });
      },
    });
  }
  if ('in' in match) {
    return (
      <CommittedField
        label="Any of"
        helper="Separate the values with commas."
        value={match.in.map(valueText).join(', ')}
        disabled={env.locked}
        onCommit={(text) => {
          const values = parseValues(text);
          if (values.length > 0) set({ in: [...values] });
        }}
      />
    );
  }
  return (
    <CommittedField
      label="Value"
      value={valueText(match.eq)}
      disabled={env.locked}
      onCommit={(text) => {
        set({ eq: parseValue(text) });
      }}
    />
  );
}

function CaseRow({
  section,
  node,
  index,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
  readonly index: number;
}): ReactNode {
  const { view, env, actions } = section;
  const row = node.cases?.[index];
  if (row === undefined) return null;
  const count = node.cases?.length ?? 0;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <RowTitle text={`Case ${String(index + 1)}`} />
        <RowActions
          noun={`case ${String(index + 1)}`}
          index={index}
          count={count}
          disabled={env.locked}
          onMove={(to) => {
            actions.editRows(view.key, [{ t: 'case.move', id: row.id, to }]);
          }}
          onRemove={() => {
            actions.editRows(view.key, [{ t: 'case.remove', id: row.id }]);
          }}
        />
      </View>
      <Segmented<MatchType>
        label={`Case ${String(index + 1)} match`}
        options={MATCH_TYPES}
        value={matchTypeOf(row.match)}
        disabled={env.locked}
        fill
        onChange={(type) => {
          actions.editRows(view.key, [
            { t: 'case.match', id: row.id, match: convertMatch(row.match, type) },
          ]);
        }}
      />
      <MatchValue section={section} id={row.id} match={row.match} />
    </View>
  );
}

function AddButtons({
  section,
  node,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { view, env, actions } = section;
  const missing = caseChoices(
    (node.cases ?? []).map((row) => row.match),
    env.subjectChoices?.options ?? [],
  );
  return (
    <>
      <Button
        label="Add a case"
        icon="plus"
        variant="tonal"
        disabled={env.locked}
        onPress={() => {
          actions.editRows(view.key, [{ t: 'case.add', id: newRowId(), match: { eq: '' } }]);
        }}
      />
      {missing.length === 0 ? null : (
        <Button
          label="Add all options"
          icon="list"
          variant="outlined"
          disabled={env.locked}
          onPress={() => {
            actions.editRows(
              view.key,
              missing.map((id) => ({ t: 'case.add', id: newRowId(), match: { eq: id } })),
            );
          }}
        />
      )}
    </>
  );
}

export function SwitchRows({
  section,
  node,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { view, env, actions } = section;
  const all = node.ports?.['mode'];
  return (
    <Section title="Cases">
      <View className="gap-4 px-4 py-2">
        {(node.cases ?? []).map((row, index) => (
          <CaseRow key={row.id} section={section} node={node} index={index} />
        ))}
        <AddButtons section={section} node={node} />
      </View>
      <List>
        <SwitchRow
          title="Run every matching case"
          subtitle="Off runs only the first case that matches."
          value={all !== undefined && 'lit' in all && all.lit === 'all'}
          disabled={env.locked}
          onChange={(on) => {
            actions.apply(portOps(view.key, 'mode', on ? { lit: 'all' } : null));
          }}
        />
      </List>
    </Section>
  );
}
