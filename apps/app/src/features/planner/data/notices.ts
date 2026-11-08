import { background } from '@smarteverything/logging';
import { plannerKeys } from '../../../queries/keys';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { receivePlannerRing } from './ring';
import { receivePlannerSummary } from './summary';

export const PLANNER_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['planner_summary'], (message) => {
    receivePlannerSummary(message);
  }),
  noticeHandler(['planner_ring'], (message, { client }) => {
    receivePlannerRing(message);
    background(
      client.invalidateQueries({ queryKey: plannerKeys.prefix('rings') }),
      'queries.invalidate_failed',
    );
  }),
];
