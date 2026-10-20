import type { AutomationV2, StepV2, TriggerV2 } from './v2-schema';

type NewId = () => string;

function idOf(existing: string | undefined, newId: NewId, remap: boolean): string {
  return remap || existing === undefined ? newId() : existing;
}

function identifiedSteps(steps: readonly StepV2[], newId: NewId, remap: boolean): StepV2[] {
  return steps.map((step) => {
    const id = idOf(step.id, newId, remap);
    if (step.do === 'if')
      return {
        ...step,
        id,
        branches: step.branches.map((branch) => ({
          ...branch,
          id: idOf(branch.id, newId, remap),
          then: identifiedSteps(branch.then, newId, remap),
        })),
        ...(step.else === undefined ? {} : { else: identifiedSteps(step.else, newId, remap) }),
      };
    if (step.do === 'repeat')
      return { ...step, id, steps: identifiedSteps(step.steps, newId, remap) };
    return { ...step, id };
  });
}

function identifiedTriggers(
  triggers: readonly TriggerV2[],
  newId: NewId,
  remap: boolean,
): TriggerV2[] {
  return triggers.map((trigger) => ({ ...trigger, id: idOf(trigger.id, newId, remap) }));
}

export function identifiedAutomationV2(
  automation: AutomationV2,
  newId: NewId,
  remap: boolean,
): AutomationV2 {
  return {
    ...automation,
    when: identifiedTriggers(automation.when, newId, remap),
    steps: identifiedSteps(automation.steps, newId, remap),
  };
}
