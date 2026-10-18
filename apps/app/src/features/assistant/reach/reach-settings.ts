import { createElement, type ReactNode } from 'react';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { CameraAllowRows } from './camera-allow-rows';
import { OutreachHistory } from './outreach-history';
import { QuietHoursRow } from './quiet-hours-row';

const REACH_PAGE = 'assistant/reach';

const owner = (env: SettingEnv): boolean => env.owner;

interface RowEntry {
  readonly id: string;
  readonly section: string | null;
  readonly title: string;
  readonly description?: string;
  readonly keywords: readonly string[];
  readonly visible?: (env: SettingEnv) => boolean;
  readonly render: () => ReactNode;
}

const ROWS: readonly RowEntry[] = [
  {
    id: 'quiet',
    section: null,
    title: 'Quiet hours',
    keywords: ['quiet hours', 'do not disturb', 'night', 'urgent'],
    render: () => createElement(QuietHoursRow),
  },
  {
    id: 'cameras',
    section: 'Cameras the AI may talk through',
    title: 'Cameras the AI may talk through',
    description: 'Every camera is on unless you turn it off. New cameras are on too.',
    keywords: ['camera speaker', 'talk through camera', 'bedroom', 'privacy'],
    visible: owner,
    render: () => createElement(CameraAllowRows),
  },
  {
    id: 'recent',
    section: 'Recent',
    title: 'Recent calls and messages',
    keywords: ['ai calls', 'outreach', 'history', 'missed calls'],
    render: () => createElement(OutreachHistory),
  },
];

export const REACH_SETTINGS: readonly SettingDefinition[] = ROWS.map((row) => ({
  id: `assistant.reach.${row.id}`,
  page: REACH_PAGE,
  ...(row.section === null ? {} : { section: row.section }),
  title: row.title,
  ...(row.description === undefined ? {} : { description: row.description }),
  keywords: ['reaching you', 'ai calls', ...row.keywords],
  scope: 'server',
  control: 'custom',
  row: true,
  ...(row.visible === undefined ? {} : { visible: row.visible }),
  render: row.render,
}));
