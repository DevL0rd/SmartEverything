import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ROW } from '@smarteverything/domain';
import { vacuumScheduleAutomation } from '../../../automations';
import { deviceOf, makeTable } from '../../../../store/state';

interface Props {
  readonly children?: ReactNode;
  readonly label?: string;
  readonly title?: string;
  readonly body?: string;
  readonly action?: ReactNode;
  readonly value?: boolean;
  readonly onChange?: (value: boolean) => void;
}

interface Seen {
  rows: Readonly<Record<string, unknown>>;
  switches: { readonly label: string; readonly onChange: (value: boolean) => void }[];
  toggles: (readonly [string, boolean])[];
}

const seen = vi.hoisted((): Seen => ({ rows: {}, switches: [], toggles: [] }));

function part(name: string): (props: Props) => ReactNode {
  function Part(props: Props): ReactNode {
    return createElement('div', { 'data-part': name, 'aria-label': props.label }, props.children);
  }
  return Part;
}

function emptyState(props: Props): ReactNode {
  return createElement('div', { 'data-part': 'empty' }, props.title, props.body, props.action);
}

function button(props: Props): ReactNode {
  return createElement('button', null, props.label);
}

function toggle(props: Props): ReactNode {
  const { label, onChange } = props;
  if (label !== undefined && onChange !== undefined) seen.switches.push({ label, onChange });
  return createElement('input', { 'aria-label': label, 'data-on': String(props.value) });
}

vi.mock('react-native', () => ({ View: part('view'), Platform: { OS: 'web' } }));
vi.mock('expo-router', () => ({
  useRouter: (): { push: () => void } => ({ push: (): void => undefined }),
}));
vi.mock('./schedule-sheet', () => ({ ScheduleSheet: part('sheet') }));
vi.mock('../../../../api/automations', () => ({ createAutomation: vi.fn() }));
vi.mock('../../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../../components/button', () => ({ Button: button }));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: emptyState }));
vi.mock('../../../../components/interactive', () => ({ Interactive: part('row') }));
vi.mock('../../../../components/switch', () => ({ Switch: toggle }));
vi.mock('../../../../components/text', () => ({ Text: part('text') }));
vi.mock('../../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-10-24T12:00:00Z'),
}));
vi.mock('../../../../store/selectors', () => ({
  useSettings: (): { time_zone: string } => ({ time_zone: 'Europe/Berlin' }),
}));
vi.mock('../../../../store/store-context', () => ({
  useStoreSelector: (select: (state: unknown) => unknown): unknown =>
    select({
      tables: {
        automations: makeTable(seen.rows, Object.keys(seen.rows), 1),
        automation_plugin_kinds: makeTable({}, [], 1),
      },
    }),
}));
vi.mock('../../model/display-name', () => ({ useDisplayName: (): string => 'Robot Vacuum' }));
vi.mock('../data/use-vacuum', () => ({
  useVacuum: (): { snapshot: { mapVersionText: string } } => ({
    snapshot: { mapVersionText: '' },
  }),
}));
vi.mock('../data/scene-query', () => ({
  useVacuumScene: (): unknown => ({
    scene: {
      rooms: [
        { id: 3, name: 'Kitchen', hidden: false },
        { id: 5, name: 'Hall', hidden: false },
      ],
    },
  }),
}));
vi.mock('../../../automations', async () => {
  const consumers = await import('../../../automations/model/consumers/vacuum-schedule');
  const templates = await import('../../../automations/model/templates/vacuum-schedule');
  const rows = await import('../../../automations/data/automation-rows');
  const lookups = await import('../../../automations/data/kind-lookup');
  return {
    ...consumers,
    ...templates,
    automationRowsOf: rows.automationRowsOf,
    kindsOfState: lookups.kindsOfState,
    links: { edit: (id: string): string => `/automations/${id}/edit` },
    toggleAutomation: (id: string, on: boolean): void => {
      seen.toggles.push([id, on]);
    },
  };
});

const { VacuumSchedules } = await import('./schedules');

const ROBOT = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const device = deviceOf(
  DEVICE_ROW.parse({
    id: ROBOT,
    provider: 'xiaomi',
    external_id: 'vacuum-1',
    parent_id: null,
    kind: 'vacuum',
    name: 'Robot Vacuum',
    display_name: null,
    model: 'vacuum',
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-24T08:00:00.000Z',
    updated_at: '2026-10-24T08:00:00.000Z',
  }),
);

const MOMENT = '2026-10-24T08:00:00.000Z';
const ON = '6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const OFF = '7b2f1d3e-4c5d-4f6a-9b0c-1d2e3f4a5b6c';

const MADE_NAME = 'Robot Vacuum: clean Kitchen and Hall at 09:30';

function scheduleRow(
  id: string,
  enabled: boolean,
  given = MADE_NAME,
): Readonly<Record<string, unknown>> {
  const { name, definition } = vacuumScheduleAutomation({
    deviceId: ROBOT,
    name: given,
    at: '09:30',
    days: [1, 3, 5],
    rooms: [3, 5],
    mode: 'sweep_mop',
  });
  return {
    [id]: {
      id,
      name,
      enabled,
      revision: 1,
      definition,
      draft: null,
      layout: { nodes: {}, frames: [], comments: [] },
      origin: null,
      author: null,
      last_run_at: null,
      last_error: null,
      run_count: 0,
      created_at: MOMENT,
      updated_at: MOMENT,
    },
  };
}

function html(): string {
  return renderToStaticMarkup(createElement(VacuumSchedules, { device }));
}

beforeEach(() => {
  seen.rows = {};
  seen.switches = [];
  seen.toggles = [];
});

describe('vacuum schedule tab', () => {
  it('invites to add one when no automation cleans this robot', () => {
    const page = html();
    expect(page).toContain('No schedules yet. Add one.');
    expect(page).toContain('Add schedule');
    expect(page).not.toContain('Xiaomi Home');
  });

  it('lists each cleaning automation with its days, time, rooms, mode and next run', () => {
    seen.rows = scheduleRow(ON, true);
    const page = html();
    expect(page).toContain('09:30');
    expect(page).toContain('Mon, Wed, Fri');
    expect(page).toContain('Kitchen and Hall · Vacuum and mop');
    expect(page).toMatch(/Next clean Mon[^<]*26[^<]*</);
    expect(page).not.toContain(`· ${MADE_NAME}`);
    expect(page).not.toMatch(/Next clean[^<]*09:30/);
    expect(page).toContain('data-on="true"');
    expect(page).not.toContain('No schedules yet');
  });

  it('switches the automation off through the automation toggle', () => {
    seen.rows = scheduleRow(ON, true);
    html();
    const [row] = seen.switches;
    row?.onChange(false);
    expect(seen.toggles).toStrictEqual([[ON, false]]);
  });

  it('shows a switched-off schedule as off without a next run', () => {
    seen.rows = scheduleRow(OFF, false);
    const page = html();
    expect(page).toContain('data-on="false"');
    expect(page).toMatch(/>Off</);
  });

  it('names the schedule only when someone renamed its automation', () => {
    seen.rows = scheduleRow(ON, true, 'Before guests');
    expect(html()).toMatch(/Next clean Mon[^<]*26[^<]* · Before guests/);
  });
});
