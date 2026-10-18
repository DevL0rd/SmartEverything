import {
  isFrom,
  walkSteps,
  type AutomationV2,
  type ConditionV2,
  type TriggerV2,
} from '@smarteverything/domain';

export const LIST_SECTIONS = ['attention', 'scheduled', 'events', 'paused'] as const;

export type ListSection = (typeof LIST_SECTIONS)[number];

export const SECTION_TITLES: Readonly<Record<ListSection, string>> = {
  attention: 'Needs attention',
  scheduled: 'Scheduled',
  events: 'On events',
  paused: 'Paused',
};

const TIMED_TRIGGERS: ReadonlySet<TriggerV2['on']> = new Set(['time', 'sun', 'every']);

export interface RuleFacts {
  readonly automation: AutomationV2 | null;
  readonly enabled: boolean;
  readonly lastError: string | null;
}

export function sectionOf(rule: RuleFacts): ListSection {
  if (rule.automation === null || rule.lastError !== null) {
    return 'attention';
  }
  if (!rule.enabled) {
    return 'paused';
  }
  return rule.automation.when.some((trigger) => TIMED_TRIGGERS.has(trigger.on))
    ? 'scheduled'
    : 'events';
}

export function matchesQuery(name: string, sentence: string | null, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') {
    return true;
  }
  return `${name} ${sentence ?? ''}`.toLowerCase().includes(wanted);
}

export function leadTrigger(automation: AutomationV2 | null): TriggerV2 | null {
  return automation?.when[0] ?? null;
}

function conditionsOf(automation: AutomationV2): readonly ConditionV2[] {
  const nested = walkSteps(automation.steps).flatMap((step): readonly ConditionV2[] => {
    if (step.do === 'if') return step.branches.map((branch) => branch.when);
    if (step.do === 'repeat')
      return [step.while, step.until].filter((entry) => entry !== undefined);
    return step.do === 'set' && step.while !== undefined ? [step.while] : [];
  });
  return automation.onlyIf === undefined ? nested : [automation.onlyIf, ...nested];
}

function conditionUsesPlace(condition: ConditionV2): boolean {
  if ('all' in condition) return condition.all.some(conditionUsesPlace);
  if ('any' in condition) return condition.any.some(conditionUsesPlace);
  if ('not' in condition) return conditionUsesPlace(condition.not);
  if ('daylight' in condition) return true;
  return (
    'compare' in condition &&
    'weather' in (isFrom(condition.compare) ? condition.compare.from : condition.compare)
  );
}

function triggerUsesPlace(trigger: TriggerV2): boolean {
  return trigger.on === 'sun' || (trigger.on === 'signal' && trigger.source === 'weather');
}

export function usesPlace(automation: AutomationV2): boolean {
  return (
    automation.when.some(triggerUsesPlace) || conditionsOf(automation).some(conditionUsesPlace)
  );
}
