import { createElement } from 'react';
import type { SettingDefinition } from '../../../settings/types';
import { BudgetBanner } from '../costs/budget-banner';
import { BUDGET_PAGE } from '../costs/budget-meter';
import { HardStopRow, LIMITS, LimitRow, WarnAtRow } from './budget-rows';

interface RowEntry {
  readonly id: string;
  readonly section: string | null;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly render: () => ReturnType<typeof createElement>;
}

const ROWS: readonly RowEntry[] = [
  {
    id: 'paused',
    section: null,
    title: 'Background AI paused',
    keywords: ['paused', 'stopped'],
    render: () => createElement(BudgetBanner),
  },
  {
    id: 'daily',
    section: 'Limits',
    title: LIMITS.daily.title,
    keywords: ['daily budget', 'per day', 'limit'],
    render: () => createElement(LimitRow, { spec: LIMITS.daily }),
  },
  {
    id: 'monthly',
    section: 'Limits',
    title: LIMITS.monthly.title,
    keywords: ['monthly budget', 'per month', 'limit'],
    render: () => createElement(LimitRow, { spec: LIMITS.monthly }),
  },
  {
    id: 'warn',
    section: 'Limits',
    title: 'Warn me early at',
    keywords: ['warning', 'percent', 'early'],
    render: () => createElement(WarnAtRow),
  },
  {
    id: 'burn',
    section: 'Alerts',
    title: LIMITS.burn.title,
    keywords: ['burn', 'spike', 'spending fast'],
    render: () => createElement(LimitRow, { spec: LIMITS.burn }),
  },
  {
    id: 'credits',
    section: 'Alerts',
    title: LIMITS.credits.title,
    keywords: ['credits', 'openrouter', 'low balance'],
    render: () => createElement(LimitRow, { spec: LIMITS.credits }),
  },
  {
    id: 'stop',
    section: 'At the limit',
    title: 'Pause background AI at the limit',
    keywords: ['hard stop', 'pause', 'wake-ups', 'routines'],
    render: () => createElement(HardStopRow),
  },
];

export const BUDGET_SETTINGS: readonly SettingDefinition[] = ROWS.map((row) => ({
  id: `assistant.budget.${row.id}`,
  page: BUDGET_PAGE,
  ...(row.section === null ? {} : { section: row.section }),
  title: row.title,
  keywords: ['ai budget', ...row.keywords],
  scope: 'server',
  control: 'custom',
  row: row.section !== null,
  render: row.render,
}));
