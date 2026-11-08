import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import { ClassChips } from './class-chips';
import type { GraphSectionProps } from './graph-connections-model';
import { canFailAgain, catchTitle, classesOps, failAgainOps } from './graph-row-model';

type CatchScope = 'any' | 'some';

const CATCH_SCOPES: readonly { readonly value: CatchScope; readonly label: string }[] = [
  { value: 'any', label: 'Any failure' },
  { value: 'some', label: 'Only some kinds' },
];

export function CatchKinds({
  section,
  index,
}: {
  readonly section: GraphSectionProps;
  readonly index: number;
}): ReactNode {
  const { node, locked, actions } = section;
  const row = node.catches?.[index];
  const [picking, setPicking] = useState(false);
  if (row === undefined) return null;
  const classes = row.classes ?? [];
  const scope: CatchScope = picking || classes.length > 0 ? 'some' : 'any';
  return (
    <>
      <Segmented<CatchScope>
        label={`What ${catchTitle(index).toLowerCase()} handles`}
        options={CATCH_SCOPES}
        value={scope}
        disabled={locked}
        fill
        onChange={(next) => {
          setPicking(next === 'some');
          if (next === 'any' && classes.length > 0) actions.apply(classesOps(node.key, row.id, []));
        }}
      />
      {scope === 'some' ? (
        <ClassChips
          label={`Failure kinds for ${catchTitle(index).toLowerCase()}`}
          classes={classes}
          disabled={locked}
          onChange={(next) => {
            actions.apply(classesOps(node.key, row.id, next));
          }}
        />
      ) : null}
    </>
  );
}

export const FAIL_AGAIN_TAKEN =
  'This catch already goes to a step. Remove that link to fail again.';

export function FailAgain({
  section,
  rowId,
}: {
  readonly section: GraphSectionProps;
  readonly rowId: string;
}): ReactNode {
  const { node, locked, actions } = section;
  const free = canFailAgain(node, rowId);
  return (
    <View className="gap-1">
      <View className="self-start">
        <Button
          label="Fail again"
          variant="outlined"
          icon="alert"
          disabled={locked || !free}
          onPress={() => {
            actions.apply(failAgainOps(node.key, rowId));
          }}
        />
      </View>
      {free || locked ? null : (
        <Text variant="footnote" tone="variant">
          {FAIL_AGAIN_TAKEN}
        </Text>
      )}
    </View>
  );
}
