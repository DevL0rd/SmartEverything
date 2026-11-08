import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SwitchMatch } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { SwitchRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import { CatchKinds, FailAgain } from './catch-kinds';
import { CommittedField } from './committed-field';
import type { GraphSectionProps } from './graph-connections-model';
import {
  addBranchOps,
  addCaseOps,
  addCatchOps,
  addEachCaseOps,
  branchTitle,
  canRemoveRow,
  caseTitle,
  catchTitle,
  everyCaseOps,
  matchOps,
  moveRowOps,
  removeRowOps,
  rowKindOf,
  runsEveryCase,
  whenOps,
  type RowKind,
} from './graph-row-model';
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
import { RowActions, RowTitle } from './row-controls';
import { RowName } from './row-name';

const CATCH_CAPTION = 'Fail again runs after Finally.';

interface RowProps {
  readonly section: GraphSectionProps;
  readonly index: number;
}

interface MatchProps {
  readonly section: GraphSectionProps;
  readonly id: string;
  readonly match: SwitchMatch;
}

function Header({
  section,
  kind,
  id,
  index,
  title,
  name,
  count,
  movable,
}: RowProps & {
  readonly kind: RowKind;
  readonly id: string;
  readonly title: string;
  readonly name?: string | undefined;
  readonly count: number;
  readonly movable: boolean;
}): ReactNode {
  const { node, locked, actions } = section;
  return (
    <View className="flex-row items-center justify-between gap-2">
      <RowTitle text={name ?? title} />
      <RowActions
        noun={name ?? title.toLowerCase()}
        index={index}
        count={count}
        disabled={locked}
        canRemove={canRemoveRow(node, kind)}
        {...(movable
          ? {
              onMove: (to: number): void => {
                actions.apply(moveRowOps(node.key, kind, id, to));
              },
            }
          : {})}
        onRemove={() => {
          actions.apply(removeRowOps(node.key, kind, id));
        }}
      />
    </View>
  );
}

function BranchRow({ section, index }: RowProps): ReactNode {
  const { node, renderValue, actions } = section;
  const row = node.branches?.[index];
  if (row === undefined) return null;
  return (
    <View className="gap-2">
      <Header
        section={section}
        index={index}
        kind="branch"
        id={row.id}
        title={branchTitle(index)}
        name={row.name}
        count={node.branches?.length ?? 0}
        movable
      />
      <RowName section={section} kind="branch" row={row} index={index} />
      {renderValue({
        nodeKey: node.key,
        slot: `branch:${row.id}`,
        label: 'Condition',
        helper: undefined,
        type: { t: 'boolean' },
        control: { t: 'switch' },
        isStatic: false,
        required: true,
        value: row.when,
        message: undefined,
        onChange: (when) => {
          if (when !== null) actions.apply(whenOps(node.key, row.id, when));
        },
      })}
    </View>
  );
}

function RangeFields({ section, id, match }: MatchProps): ReactNode {
  const { node, locked, actions } = section;
  const draft = rangeDraft(match);
  const commit = (next: RangeDraft): void => {
    const result = rangeMatch(next);
    if (result.ok) actions.apply(matchOps(node.key, id, result.match));
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
          disabled={locked}
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
          disabled={locked}
          validate={(text) => problem({ ...draft, max: text })}
          onCommit={(max) => {
            commit({ ...draft, max });
          }}
        />
      </View>
    </View>
  );
}

function MatchValue({ section, id, match }: MatchProps): ReactNode {
  const { node, locked, renderValue, actions } = section;
  const set = (next: SwitchMatch): void => {
    actions.apply(matchOps(node.key, id, next));
  };
  if ('range' in match) return <RangeFields section={section} id={id} match={match} />;
  if ('when' in match) {
    return renderValue({
      nodeKey: node.key,
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
        disabled={locked}
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
      disabled={locked}
      onCommit={(text) => {
        set({ eq: parseValue(text) });
      }}
    />
  );
}

function CaseRow({ section, index }: RowProps): ReactNode {
  const { node, locked, actions } = section;
  const row = node.cases?.[index];
  if (row === undefined) return null;
  return (
    <View className="gap-2">
      <Header
        section={section}
        index={index}
        kind="case"
        id={row.id}
        title={caseTitle(index)}
        name={row.name}
        count={node.cases?.length ?? 0}
        movable
      />
      <RowName section={section} kind="case" row={row} index={index} />
      <Segmented<MatchType>
        label={`${row.name ?? caseTitle(index)} match`}
        options={MATCH_TYPES}
        value={matchTypeOf(row.match)}
        disabled={locked}
        fill
        onChange={(type) => {
          actions.apply(matchOps(node.key, row.id, convertMatch(row.match, type)));
        }}
      />
      <MatchValue section={section} id={row.id} match={row.match} />
    </View>
  );
}

function CatchRow({ section, index }: RowProps): ReactNode {
  const { node } = section;
  const row = node.catches?.[index];
  if (row === undefined) return null;
  return (
    <View className="gap-2">
      <Header
        section={section}
        index={index}
        kind="catch"
        id={row.id}
        title={catchTitle(index)}
        count={node.catches?.length ?? 0}
        movable={false}
      />
      <CatchKinds section={section} index={index} />
      <FailAgain section={section} rowId={row.id} />
    </View>
  );
}

function AddCaseButtons({ section }: { readonly section: GraphSectionProps }): ReactNode {
  const { node, locked, subjectChoices, actions } = section;
  const missing = caseChoices(
    (node.cases ?? []).map((row) => row.match),
    subjectChoices?.options ?? [],
  );
  return (
    <>
      <Button
        label="Add a case"
        icon="plus"
        variant="tonal"
        disabled={locked}
        onPress={() => {
          actions.apply(addCaseOps(node.key, { eq: '' }));
        }}
      />
      {missing.length === 0 ? null : (
        <Button
          label="Add all options"
          icon="list"
          variant="outlined"
          disabled={locked}
          onPress={() => {
            actions.apply(addEachCaseOps(node.key, missing));
          }}
        />
      )}
    </>
  );
}

function BranchRows(section: GraphSectionProps): ReactNode {
  const { node, locked, actions } = section;
  return (
    <Section title="Cases">
      <View className="gap-4 px-4 py-2">
        {(node.branches ?? []).map((row, index) => (
          <BranchRow key={row.id} section={section} index={index} />
        ))}
        <Button
          label="Add a case"
          icon="plus"
          variant="tonal"
          disabled={locked}
          onPress={() => {
            actions.apply(addBranchOps(node.key));
          }}
        />
      </View>
    </Section>
  );
}

function CaseRows(section: GraphSectionProps): ReactNode {
  const { node, locked, actions } = section;
  return (
    <Section title="Cases">
      <View className="gap-4 px-4 py-2">
        {(node.cases ?? []).map((row, index) => (
          <CaseRow key={row.id} section={section} index={index} />
        ))}
        <AddCaseButtons section={section} />
      </View>
      <List>
        <SwitchRow
          title="Run every matching case"
          subtitle="Off runs only the first case that matches."
          value={runsEveryCase(node)}
          disabled={locked}
          onChange={(on) => {
            actions.apply(everyCaseOps(node.key, on));
          }}
        />
      </List>
    </Section>
  );
}

function CatchRows(section: GraphSectionProps): ReactNode {
  const { node, locked, actions } = section;
  return (
    <Section title="Catch">
      <View className="gap-4 px-4 py-2">
        {(node.catches ?? []).map((row, index) => (
          <CatchRow key={row.id} section={section} index={index} />
        ))}
        <Button
          label="Add a catch"
          icon="plus"
          variant="tonal"
          disabled={locked}
          onPress={() => {
            actions.apply(addCatchOps(node.key));
          }}
        />
        <Text variant="footnote" tone="variant">
          {CATCH_CAPTION}
        </Text>
      </View>
    </Section>
  );
}

const ROW_EDITORS: Readonly<Record<RowKind, (props: GraphSectionProps) => ReactNode>> = {
  branch: BranchRows,
  case: CaseRows,
  catch: CatchRows,
};

export function GraphRowEditors(section: GraphSectionProps): ReactNode {
  const kind = rowKindOf(section.node);
  if (kind === undefined) return null;
  const Editor = ROW_EDITORS[kind];
  return <Editor {...section} />;
}
