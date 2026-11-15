import type {
  PlannerAssignedNotice,
  PlannerInvitedNotice,
  PlannerRsvpNotice,
} from '@smarteverything/domain';
import type { OwnerAlert } from '../../extensions/owner-alerts';

export type CollaborationNotice = PlannerInvitedNotice | PlannerRsvpNotice | PlannerAssignedNotice;

const ANSWERS = { yes: 'is going to', no: 'cannot come to', maybe: 'might come to' } as const;

export function alertOf(notice: CollaborationNotice): OwnerAlert {
  const data = { kind: notice.type, itemId: notice.itemId };
  if (notice.type === 'planner_invited') {
    return { title: 'New invitation', body: notice.title, data, person: notice.personId };
  }
  if (notice.type === 'planner_rsvp') {
    return {
      title: 'Invitation answered',
      body: `A guest ${ANSWERS[notice.response]} ${notice.title}`,
      data,
      person: notice.personId,
    };
  }
  return {
    title: notice.state === 'assigned' ? 'Task assigned to you' : 'Assigned task done',
    body: notice.title,
    data,
    person: notice.personId,
  };
}
