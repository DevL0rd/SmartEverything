import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StepV2 } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { describeCondition } from '../model/describe';
import { describeStep } from '../model/describe-steps';
import { ELSE_SLOT, BODY_SLOT, editBlock, type BlockAddress } from '../model/steps';
import { AddStepMenu } from './add-step-menu';
import { STEP_LOOKS, stepIcon } from './kinds';
import { StepActions } from './step-actions';
import { BlockProblems } from './step-card';
import { useStepTree } from './step-tree';

interface NestedProps {
  readonly title: string;
  readonly block: BlockAddress;
  readonly steps: readonly StepV2[];
}

function NestedBlock({ title, block, steps }: NestedProps): ReactNode {
  return (
    <View className="gap-2 border-l-2 border-outline-variant pl-3">
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {title}
      </Text>
      <StepList block={block} steps={steps} />
    </View>
  );
}

function Nested({ step }: { readonly step: StepV2 }): ReactNode {
  const tree = useStepTree();
  const owner = step.id ?? null;
  if (owner === null) return null;
  if (step.do === 'repeat')
    return <NestedBlock title="Repeats" block={{ owner, slot: BODY_SLOT }} steps={step.steps} />;
  if (step.do !== 'if') return null;
  return (
    <>
      {step.branches.map((branch, index) => (
        <NestedBlock
          key={branch.id ?? String(index)}
          title={`If ${describeCondition(tree.catalog.names, branch.when) || 'always'}`}
          block={{ owner, slot: branch.id ?? '' }}
          steps={branch.then}
        />
      ))}
      {step.else === undefined ? null : (
        <NestedBlock title="Otherwise" block={{ owner, slot: ELSE_SLOT }} steps={step.else} />
      )}
    </>
  );
}

function StepRow({
  step,
  position,
  count,
}: {
  readonly step: StepV2;
  readonly position: number;
  readonly count: number;
}): ReactNode {
  const tree = useStepTree();
  const id = step.id;
  return (
    <Card>
      <ListRow
        icon={stepIcon(step, tree.catalog.allDevices)}
        title={`${String(position + 1)}. ${STEP_LOOKS[step.do].label}`}
        subtitle={describeStep(tree.catalog.names, step)}
        wrapSubtitle
        chevron
        onPress={() => {
          if (id !== undefined) tree.open(id);
        }}
      />
      <BlockProblems problems={id === undefined ? [] : (tree.problems[id] ?? [])} />
      <Nested step={step} />
      {id === undefined ? null : <StepActions id={id} position={position} count={count} />}
    </Card>
  );
}

export function StepList({
  block,
  steps,
}: {
  readonly block: BlockAddress;
  readonly steps: readonly StepV2[];
}): ReactNode {
  const tree = useStepTree();
  return (
    <View className="gap-3">
      {steps.map((step, position) => (
        <StepRow
          key={step.id ?? String(position)}
          step={step}
          position={position}
          count={steps.length}
        />
      ))}
      <AddStepMenu
        empty={steps.length === 0}
        onAdd={(added) => {
          tree.change(editBlock(tree.root, block, (existing) => [...existing, ...added]));
          const first = added[0]?.id;
          if (first !== undefined) tree.open(first);
        }}
      />
    </View>
  );
}
