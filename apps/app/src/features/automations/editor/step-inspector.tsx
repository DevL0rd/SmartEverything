import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { STEP_LABELS } from '../model/kind-labels';
import { ELSE_SLOT, findStep, replaceStep, trailTo, type Trail } from '../model/steps';
import { BlockProblems } from './step-card';
import { StepFields } from './step-fields';
import { useStepTree } from './step-tree';

function slotLabel(trail: Trail): string | null {
  const { step, slot } = trail;
  if (step.do !== 'if') return null;
  if (slot === ELSE_SLOT) return 'Otherwise';
  const index = step.branches.findIndex((branch) => branch.id === slot);
  return index < 0 ? null : `Case ${String(index + 1)}`;
}

function titleOf(trail: readonly Trail[] | null, fallback: string): string {
  if (trail === null || trail.length === 0) return fallback;
  return trail
    .flatMap((entry, index) => {
      const label = STEP_LABELS[entry.step.do];
      const slot = index === trail.length - 1 ? null : slotLabel(entry);
      return slot === null ? [label] : [label, slot];
    })
    .join(' › ');
}

export function StepInspector({
  selected,
  onClose,
}: {
  readonly selected: string | null;
  readonly onClose: () => void;
}): ReactNode {
  const tree = useStepTree();
  const step = selected === null ? undefined : findStep(tree.root, selected);
  const trail = selected === null ? null : trailTo(tree.root, selected);
  return (
    <Sheet
      open={step !== undefined}
      title={titleOf(trail, 'Step')}
      detents={['full']}
      kind="inspector"
      footer={<Button label="Done" onPress={onClose} />}
      onClose={onClose}
    >
      {step === undefined ? null : (
        <>
          <BlockProblems problems={step.id === undefined ? [] : (tree.problems[step.id] ?? [])} />
          <StepFields
            step={step}
            catalog={tree.catalog}
            onChange={(next) => {
              tree.change(replaceStep(tree.root, next));
            }}
          />
        </>
      )}
    </Sheet>
  );
}
