import type { ReactNode } from 'react';
import type { StepV2 } from '@smarteverything/domain';
import {
  STEP_KINDS,
  blankStep,
  runStepFor,
  stepAvailable,
  valueStepFor,
  type StepKind,
} from '../model/blanks';
import { RUN_PROGRAM_LABEL } from '../model/kind-labels';
import {
  defaultProgramDraft,
  laundryEntries,
  runProgramSteps,
  type LaundryEntry,
} from '../model/laundry-steps';
import { AddMenu, groupedOptions, type AddGroup } from './add-menu';
import { STEP_LOOKS } from './kinds';
import { calleeOf } from '../model/reusable-steps';
import { useProgramLibrary } from './program-library-context';
import { useStepTree } from './step-tree';

const UNAVAILABLE: Readonly<Partial<Record<StepKind, string>>> = {
  set: 'Nothing here can be controlled yet.',
  scene: 'Make a scene first.',
  ai: 'Only the owner can wake the AI.',
  tool: 'Only the owner can use tools.',
  speak: 'Needs the owner and a camera with a speaker.',
  audio: 'Pair a computer first.',
  display: 'Pair a computer first.',
};

function washerGroup(
  washers: readonly LaundryEntry[],
  onAdd: (steps: readonly StepV2[]) => void,
): AddGroup {
  return {
    title: 'Washer-dryer',
    options: washers.map((washer) => ({
      key: `program:${washer.device.id}`,
      label: RUN_PROGRAM_LABEL,
      help: `Start a wash program on ${washer.device.label}.`,
      icon: 'play',
      onPress: (): void => {
        onAdd(runProgramSteps(washer, defaultProgramDraft()));
      },
    })),
  };
}

export function AddStepMenu({
  empty,
  onAdd,
}: {
  readonly empty: boolean;
  readonly onAdd: (steps: readonly StepV2[]) => void;
}): ReactNode {
  const { catalog } = useStepTree();
  const library = useProgramLibrary();
  const choose = (kind: StepKind): void => {
    const made = blankStep(kind, catalog);
    if (made !== null) onAdd([made]);
    else if (kind === 'value' && library !== null)
      library.value(null, 'boolean', (row) => {
        onAdd([valueStepFor(row)]);
      });
    else if (kind === 'run' && library !== null)
      library.reusable(null, (row) => {
        const callee = calleeOf(row);
        if (callee !== null) onAdd([runStepFor(callee)]);
      });
  };
  const unavailable = (kind: StepKind): string | undefined => {
    if (stepAvailable(kind, catalog)) return undefined;
    if (library !== null && (kind === 'value' || kind === 'run')) return undefined;
    return UNAVAILABLE[kind] ?? 'Not available yet.';
  };
  const groups = (): readonly AddGroup[] => {
    const base = groupedOptions(STEP_KINDS, STEP_LOOKS, choose, unavailable);
    const washers = laundryEntries(catalog.devices, ['laundry_program', 'cycle_start']);
    return washers.length === 0 ? base : [...base, washerGroup(washers, onAdd)];
  };
  return <AddMenu label={empty ? 'Add a step' : 'Add another step'} groups={groups} />;
}
