import { describe, expect, it } from 'vitest';
import { PARTNER_SHARE } from '@smarteverything/domain';
import {
  bodyOf,
  draftOfShare,
  newDraft,
  nextStep,
  previousStep,
  stepNumber,
  stepReady,
  toggleGroup,
  withScope,
} from './partner-draft';

const ANA = 'a1b2c3d4-0000-4000-8000-000000000002';
const MIA = 'a1b2c3d4-0000-4000-8000-000000000040';

describe('partner setup draft', () => {
  it('walks person, scope, date and review and stops at an unanswered step', () => {
    const start = newDraft('2026-11-15');
    expect(start.step).toBe('person');
    expect(stepReady(start)).toBe(false);
    expect(nextStep(start)).toBe(start);
    const chosen = nextStep({ ...start, recipientId: ANA });
    expect(chosen.step).toBe('scope');
    expect(stepNumber(chosen.step)).toBe(2);
    expect(previousStep(chosen)?.step).toBe('person');
    expect(previousStep(start)).toBeNull();
    const review = nextStep(nextStep(chosen));
    expect(review.step).toBe('review');
    expect(nextStep(review)).toEqual(review);
  });

  it('needs at least one person for chosen people and clears them for all photos', () => {
    const draft = { ...newDraft('2026-11-15'), recipientId: ANA, step: 'scope' as const };
    const people = withScope(draft, 'people');
    expect(stepReady(people)).toBe(false);
    const withMia = toggleGroup(people, MIA);
    expect(withMia.groupIds).toEqual([MIA]);
    expect(stepReady(withMia)).toBe(true);
    expect(toggleGroup(withMia, MIA).groupIds).toEqual([]);
    expect(withScope(withMia, 'all').groupIds).toEqual([]);
  });

  it('sends exactly the rule the person chose', () => {
    const draft = {
      ...newDraft('2026-03-01'),
      recipientId: ANA,
      scope: 'people' as const,
      groupIds: [MIA],
    };
    expect(bodyOf(draft)).toEqual({
      recipientId: ANA,
      scope: 'people',
      groupIds: [MIA],
      fromDay: '2026-03-01',
    });
    expect(bodyOf(newDraft('2026-03-01'))).toBeNull();
    expect(bodyOf({ ...draft, groupIds: [] })).toBeNull();
  });

  it('opens a change of an existing share at the scope step with its rule', () => {
    const share = PARTNER_SHARE.parse({
      id: 'a1b2c3d4-0000-4000-8000-000000000030',
      sharerId: 'a1b2c3d4-0000-4000-8000-000000000001',
      recipientId: ANA,
      scope: 'people',
      groupIds: [MIA],
      fromDay: '2025-06-01',
      state: 'accepted',
      autoSave: true,
      createdAt: '2026-11-01T00:00:00Z',
    });
    expect(draftOfShare(share)).toEqual({
      step: 'scope',
      recipientId: ANA,
      scope: 'people',
      groupIds: [MIA],
      fromDay: '2025-06-01',
    });
  });
});
