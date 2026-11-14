import type { QueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { plannerKeys } from '../../../queries/keys';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { ringsQuery } from './queries';
import { openRingWhenRinging, receivePlannerRing, type RingOpener } from './ring';
import { receivePlannerSummary } from './summary';

function ringOpener(client: QueryClient): RingOpener {
  return {
    foreground: () => AppState.currentState === 'active',
    rings: (window) => client.query(ringsQuery(null, window.from, window.to)),
    now: () => Date.now(),
    open: (ringId): void => {
      router.push(href.clock.ring(ringId));
    },
  };
}

export const PLANNER_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['planner_summary'], (message) => {
    receivePlannerSummary(message);
  }),
  noticeHandler(['planner_ring'], (message, { client, live }) => {
    receivePlannerRing(message);
    background(
      client.invalidateQueries({ queryKey: plannerKeys.prefix('rings') }),
      'queries.invalidate_failed',
    );
    if (live) {
      background(openRingWhenRinging(message, ringOpener(client)), 'planner.ring_open_failed');
    }
  }),
];
