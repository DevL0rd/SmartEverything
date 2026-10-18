import { identifiedAutomationV2, walkSteps, type StepV2 } from '@smarteverything/domain';

export type FlowStep = Extract<StepV2, { do: 'value' | 'if' | 'repeat' | 'run' | 'stop' }>;

export function isFlowStep(step: StepV2): step is FlowStep {
  return (
    step.do === 'value' ||
    step.do === 'if' ||
    step.do === 'repeat' ||
    step.do === 'run' ||
    step.do === 'stop'
  );
}

export interface BlockAddress {
  readonly owner: string | null;
  readonly slot: string;
}

const ROOT_SLOT = 'root';
export const BODY_SLOT = 'body';
export const ELSE_SLOT = 'else';

export const ROOT_BLOCK: BlockAddress = { owner: null, slot: ROOT_SLOT };

type Block = readonly StepV2[];
type BlockEdit = (block: Block) => Block;

function sameItems(left: Block, right: Block): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

function mapChildren(step: StepV2, edit: BlockEdit): StepV2 {
  if (step.do === 'if') {
    const branches = step.branches.map((branch) => {
      const then = edit(branch.then);
      return sameItems(then, branch.then) ? branch : { ...branch, then };
    });
    const other = step.else === undefined ? undefined : edit(step.else);
    const same =
      branches.every((branch, index) => branch === step.branches[index]) &&
      (other === undefined || step.else === undefined || sameItems(other, step.else));
    if (same) return step;
    return { ...step, branches, ...(other === undefined ? {} : { else: other }) };
  }
  if (step.do === 'repeat') {
    const steps = edit(step.steps);
    return sameItems(steps, step.steps) ? step : { ...step, steps };
  }
  return step;
}

function editEverywhere(steps: Block, edit: BlockEdit): Block {
  const mapped = steps.map((step) => mapChildren(step, (block) => editEverywhere(block, edit)));
  const next = sameItems(mapped, steps) ? steps : mapped;
  return edit(next);
}

export function findStep(steps: Block, id: string): StepV2 | undefined {
  return walkSteps(steps).find((step) => step.id === id);
}

export function replaceStep(steps: Block, next: StepV2): Block {
  return editEverywhere(steps, (block) =>
    block.some((step) => step.id === next.id)
      ? block.map((step) => (step.id === next.id ? next : step))
      : block,
  );
}

export function removeStep(steps: Block, id: string): Block {
  return editEverywhere(steps, (block) =>
    block.some((step) => step.id === id) ? block.filter((step) => step.id !== id) : block,
  );
}

export function moveStep(steps: Block, id: string, by: -1 | 1): Block {
  return editEverywhere(steps, (block) => {
    const index = block.findIndex((step) => step.id === id);
    const other = block[index + by];
    const step = block[index];
    if (index < 0 || other === undefined || step === undefined) return block;
    return block.map((entry, position) => {
      if (position === index) return other;
      return position === index + by ? step : entry;
    });
  });
}

export function duplicateStep(steps: Block, id: string, newId: () => string): Block {
  const original = findStep(steps, id);
  if (original === undefined) return steps;
  const copy = identifiedAutomationV2({ when: [], steps: [original] }, newId, true).steps[0];
  if (copy === undefined) return steps;
  return editEverywhere(steps, (block) => {
    const index = block.findIndex((step) => step.id === id);
    return index < 0 ? block : [...block.slice(0, index + 1), copy, ...block.slice(index + 1)];
  });
}

export function editBlock(steps: Block, address: BlockAddress, edit: BlockEdit): Block {
  if (address.owner === null) return edit(steps);
  const owner = findStep(steps, address.owner);
  if (owner === undefined) return steps;
  const update = (step: StepV2): StepV2 => {
    if (step.do === 'repeat' && address.slot === BODY_SLOT)
      return { ...step, steps: [...edit(step.steps)] };
    if (step.do !== 'if') return step;
    if (address.slot === ELSE_SLOT) return { ...step, else: [...edit(step.else ?? [])] };
    return {
      ...step,
      branches: step.branches.map((branch) =>
        branch.id === address.slot ? { ...branch, then: [...edit(branch.then)] } : branch,
      ),
    };
  };
  return replaceStep(steps, update(owner));
}

function blockOf(owner: StepV2, slot: string): Block {
  if (owner.do === 'repeat') return owner.steps;
  if (owner.do !== 'if') return [];
  if (slot === ELSE_SLOT) return owner.else ?? [];
  return owner.branches.find((branch) => branch.id === slot)?.then ?? [];
}

export function moveToBlock(
  steps: Block,
  id: string,
  target: BlockAddress & { readonly index: number },
): Block {
  const moving = findStep(steps, id);
  if (moving === undefined) return steps;
  if (target.owner !== null && findStep([moving], target.owner) !== undefined) return steps;
  const without = removeStep(steps, id);
  return editBlock(without, target, (block) => [
    ...block.slice(0, target.index),
    moving,
    ...block.slice(target.index),
  ]);
}

interface BlockChoice {
  readonly value: string;
  readonly label: string;
  readonly target: BlockAddress & { readonly index: number };
}

function branchLabel(step: Extract<StepV2, { do: 'if' }>, branchId: string | undefined): string {
  const index = step.branches.findIndex((branch) => branch.id === branchId);
  return `If › Case ${String(index + 1)}`;
}

function childBlocks(step: StepV2): readonly { slot: string; label: string }[] {
  if (step.do === 'repeat') return [{ slot: BODY_SLOT, label: 'Repeat › Steps' }];
  if (step.do !== 'if') return [];
  return [
    ...step.branches.flatMap((branch) =>
      branch.id === undefined ? [] : [{ slot: branch.id, label: branchLabel(step, branch.id) }],
    ),
    ...(step.else === undefined ? [] : [{ slot: ELSE_SLOT, label: 'If › Otherwise' }]),
  ];
}

function choicesIn(
  block: Block,
  excluded: string,
  address: BlockAddress,
  label: string,
): readonly BlockChoice[] {
  const kept = block.filter((step) => step.id !== excluded);
  const here: BlockChoice = {
    value: `${address.owner ?? ROOT_SLOT}:${address.slot}`,
    label,
    target: { ...address, index: kept.length },
  };
  const nested = block.flatMap((step) => {
    if (step.id === excluded || step.id === undefined) return [];
    return childBlocks(step).flatMap((child) =>
      choicesIn(
        blockOf(step, child.slot),
        excluded,
        { owner: step.id ?? null, slot: child.slot },
        `${label} › ${child.label}`,
      ),
    );
  });
  return [here, ...nested];
}

export function blockChoices(steps: Block, excluded: string): readonly BlockChoice[] {
  return choicesIn(steps, excluded, ROOT_BLOCK, 'Then');
}

export interface Trail {
  readonly step: StepV2;
  readonly slot: string;
}

export function trailTo(steps: Block, id: string): readonly Trail[] | null {
  for (const step of steps) {
    if (step.id === id) return [{ step, slot: ROOT_SLOT }];
    for (const child of childBlocks(step)) {
      const inner = trailTo(blockOf(step, child.slot), id);
      if (inner !== null) return [{ step, slot: child.slot }, ...inner];
    }
  }
  return null;
}
