import { isTimedTrigger, type AutomationDefinition, type Trigger } from '@smarteverything/domain';

export const LIST_SECTIONS = ['attention', 'scheduled', 'events', 'paused'] as const;

export type ListSection = (typeof LIST_SECTIONS)[number];

export const SECTION_TITLES: Readonly<Record<ListSection, string>> = {
  attention: 'Needs attention',
  scheduled: 'Scheduled',
  events: 'On events',
  paused: 'Paused',
};

export interface RuleFacts {
  readonly definition: AutomationDefinition | null;
  readonly enabled: boolean;
  readonly lastError: string | null;
}

export function sectionOf(rule: RuleFacts): ListSection {
  if (rule.definition === null || rule.lastError !== null) {
    return 'attention';
  }
  if (!rule.enabled) {
    return 'paused';
  }
  return rule.definition.triggers.some(isTimedTrigger) ? 'scheduled' : 'events';
}

export function matchesQuery(name: string, sentence: string | null, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') {
    return true;
  }
  return `${name} ${sentence ?? ''}`.toLowerCase().includes(wanted);
}

export function leadTrigger(definition: AutomationDefinition | null): Trigger | null {
  return definition?.triggers[0] ?? null;
}
