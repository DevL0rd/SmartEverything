import { PARTNER_SET, type PartnerSet, type PartnerShare } from '@smarteverything/domain';

export const PARTNER_STEPS = ['person', 'scope', 'date', 'review'] as const;

export type PartnerStep = (typeof PARTNER_STEPS)[number];

export const STEP_TITLE: Readonly<Record<PartnerStep, string>> = {
  person: 'Choose a partner',
  scope: 'Which photos',
  date: 'Starting from',
  review: 'Review and send',
};

export interface PartnerDraft {
  readonly step: PartnerStep;
  readonly recipientId: string | null;
  readonly scope: PartnerSet['scope'];
  readonly groupIds: readonly string[];
  readonly fromDay: string;
}

export function newDraft(today: string): PartnerDraft {
  return { step: 'person', recipientId: null, scope: 'all', groupIds: [], fromDay: today };
}

export function draftOfGroup(today: string, groupId: string): PartnerDraft {
  return { ...newDraft(today), scope: 'people', groupIds: [groupId] };
}

export function draftOfShare(share: PartnerShare): PartnerDraft {
  return {
    step: 'scope',
    recipientId: share.recipientId,
    scope: share.scope,
    groupIds: share.groupIds,
    fromDay: share.fromDay,
  };
}

export function stepReady(draft: PartnerDraft): boolean {
  switch (draft.step) {
    case 'person':
      return draft.recipientId !== null;
    case 'scope':
      return draft.scope === 'all' || draft.groupIds.length > 0;
    case 'date':
      return draft.fromDay !== '';
    case 'review':
      return bodyOf(draft) !== null;
  }
}

function offset(step: PartnerStep, by: number): PartnerStep | null {
  return PARTNER_STEPS[PARTNER_STEPS.indexOf(step) + by] ?? null;
}

export function nextStep(draft: PartnerDraft): PartnerDraft {
  const step = offset(draft.step, 1);
  return step === null || !stepReady(draft) ? draft : { ...draft, step };
}

export function previousStep(draft: PartnerDraft): PartnerDraft | null {
  const step = offset(draft.step, -1);
  return step === null ? null : { ...draft, step };
}

export function stepNumber(step: PartnerStep): number {
  return PARTNER_STEPS.indexOf(step) + 1;
}

export function toggleGroup(draft: PartnerDraft, groupId: string): PartnerDraft {
  const groupIds = draft.groupIds.includes(groupId)
    ? draft.groupIds.filter((id) => id !== groupId)
    : [...draft.groupIds, groupId];
  return { ...draft, groupIds };
}

export function withScope(draft: PartnerDraft, scope: PartnerSet['scope']): PartnerDraft {
  return { ...draft, scope, groupIds: scope === 'all' ? [] : draft.groupIds };
}

export function bodyOf(draft: PartnerDraft): PartnerSet | null {
  if (draft.recipientId === null) return null;
  const parsed = PARTNER_SET.safeParse({
    recipientId: draft.recipientId,
    scope: draft.scope,
    groupIds: draft.scope === 'all' ? [] : draft.groupIds,
    fromDay: draft.fromDay,
  });
  return parsed.success ? parsed.data : null;
}
