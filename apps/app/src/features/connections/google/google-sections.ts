import type { ComponentType } from 'react';
import type { GoogleAccountRow } from '@smarteverything/domain';
import { PlannerSyncSection } from './planner-sync-section';

export interface GoogleServiceSectionProps {
  readonly account: GoogleAccountRow;
}

export interface GoogleServiceSection {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly Section: ComponentType<GoogleServiceSectionProps>;
}

export const GOOGLE_SERVICE_SECTIONS: readonly GoogleServiceSection[] = [
  {
    id: 'planner',
    title: 'Calendar and Tasks',
    summary: 'Events and task lists, both ways',
    Section: PlannerSyncSection,
  },
];
