import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action, ActionBranch } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { SwitchRow } from '../../../components/rows';
import { Card } from '../../../components/card';
import type { Catalog } from '../data/use-automations';
import { nodeId } from '../model/program-actions';
import { moved } from '../model/editor-state';
import { ProgramConditions } from './program-conditions';
import { ProgramSteps } from './program-steps';

type Choose = Extract<Action, { type: 'choose' }>;
interface BranchFieldsProps {
  readonly action: Choose;
  readonly catalog: Catalog;
  readonly onChange: (action: Choose) => void;
}
interface BranchEditorProps extends BranchFieldsProps {
  readonly branch: ActionBranch;
  readonly index: number;
}

function BranchMoves({ action, onChange, branch, index }: BranchEditorProps): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Earlier"
        variant="text"
        disabled={index === 0}
        onPress={() => {
          onChange({ ...action, branches: moved(action.branches, index, -1) });
        }}
      />
      <Button
        label="Later"
        variant="text"
        disabled={index === action.branches.length - 1}
        onPress={() => {
          onChange({ ...action, branches: moved(action.branches, index, 1) });
        }}
      />
      <Button
        label="Remove branch"
        variant="text"
        disabled={action.branches.length === 1}
        onPress={() => {
          onChange({
            ...action,
            branches: action.branches.filter((entry) => entry.nodeId !== branch.nodeId),
          });
        }}
      />
    </View>
  );
}
function BranchEditor(props: BranchEditorProps): ReactNode {
  const { action, catalog, onChange, branch, index } = props;
  const update = (next: ActionBranch): void => {
    onChange({
      ...action,
      branches: action.branches.map((entry) => (entry.nodeId === branch.nodeId ? next : entry)),
    });
  };
  return (
    <Card>
      <Text variant="body-strong">{`Branch ${String(index + 1)}`}</Text>
      <ProgramConditions
        conditions={branch.conditions}
        catalog={catalog}
        onChange={(conditions) => {
          update({ ...branch, conditions });
        }}
      />
      <ProgramSteps
        actions={branch.actions}
        catalog={catalog}
        onChange={(actions) => {
          update({ ...branch, actions: [...actions] });
        }}
      />
      <BranchMoves {...props} />
    </Card>
  );
}
function OtherwiseToggle({ action, onChange }: BranchFieldsProps): ReactNode {
  return (
    <SwitchRow
      title="Otherwise"
      subtitle="Run these steps if no branch matches."
      value={action.otherwise !== undefined}
      onChange={(enabled) => {
        if (enabled) onChange({ ...action, otherwise: [] });
        else {
          const { otherwise: _otherwise, ...rest } = action;
          onChange(rest);
        }
      }}
    />
  );
}

export function BranchFields({ action, catalog, onChange }: BranchFieldsProps): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Runs the first matching branch. Order matters.
      </Text>
      {action.branches.map((branch, index) => (
        <BranchEditor
          key={branch.nodeId}
          action={action}
          catalog={catalog}
          onChange={onChange}
          branch={branch}
          index={index}
        />
      ))}
      <Button
        label="Add branch"
        variant="tonal"
        icon="plus"
        onPress={() => {
          onChange({
            ...action,
            branches: [
              ...action.branches,
              { nodeId: nodeId(), conditions: { mode: 'all', items: [] }, actions: [] },
            ],
          });
        }}
      />
      <OtherwiseToggle action={action} catalog={catalog} onChange={onChange} />
      {action.otherwise === undefined ? null : (
        <ProgramSteps
          actions={action.otherwise}
          catalog={catalog}
          onChange={(otherwise) => {
            onChange({ ...action, otherwise: [...otherwise] });
          }}
        />
      )}
    </View>
  );
}
