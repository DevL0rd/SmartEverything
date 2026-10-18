import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IfBranchV2, StepV2 } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { newId } from '../model/blanks';
import { moved } from '../model/editor-state';
import { OnlyIfFields } from './condition-list';

type IfStep = Extract<StepV2, { do: 'if' }>;

interface IfFieldsProps {
  readonly catalog: Catalog;
  readonly step: IfStep;
  readonly onChange: (step: IfStep) => void;
}

function BranchMoves({
  step,
  branch,
  index,
  onChange,
}: IfFieldsProps & { readonly branch: IfBranchV2; readonly index: number }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Earlier"
        variant="text"
        disabled={index === 0}
        onPress={() => {
          onChange({ ...step, branches: moved(step.branches, index, -1) });
        }}
      />
      <Button
        label="Later"
        variant="text"
        disabled={index === step.branches.length - 1}
        onPress={() => {
          onChange({ ...step, branches: moved(step.branches, index, 1) });
        }}
      />
      <Button
        label="Remove case"
        variant="text"
        disabled={step.branches.length === 1}
        onPress={() => {
          onChange({ ...step, branches: step.branches.filter((entry) => entry.id !== branch.id) });
        }}
      />
    </View>
  );
}

function BranchEditor(
  props: IfFieldsProps & { readonly branch: IfBranchV2; readonly index: number },
): ReactNode {
  const { catalog, step, branch, index, onChange } = props;
  return (
    <Card>
      <Text variant="body-strong">{index === 0 ? 'If' : 'Otherwise, if'}</Text>
      <OnlyIfFields
        catalog={catalog}
        condition={branch.when}
        onChange={(condition) => {
          onChange({
            ...step,
            branches: step.branches.map((entry) =>
              entry.id === branch.id ? { ...branch, when: condition ?? { all: [] } } : entry,
            ),
          });
        }}
      />
      <BranchMoves {...props} />
    </Card>
  );
}

export function IfFields(props: IfFieldsProps): ReactNode {
  const { step, onChange } = props;
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Runs the first case that holds, in order. Add the steps for each case on the card.
      </Text>
      {step.branches.map((branch, index) => (
        <BranchEditor key={branch.id ?? String(index)} {...props} branch={branch} index={index} />
      ))}
      <Button
        label="Add a case"
        variant="tonal"
        icon="plus"
        onPress={() => {
          onChange({
            ...step,
            branches: [...step.branches, { id: newId(), when: { all: [] }, then: [] }],
          });
        }}
      />
      <SwitchRow
        title="Otherwise"
        subtitle="Do something if no case holds."
        value={step.else !== undefined}
        onChange={(enabled) => {
          const { else: _else, ...rest } = step;
          onChange(enabled ? { ...rest, else: [] } : rest);
        }}
      />
    </View>
  );
}
