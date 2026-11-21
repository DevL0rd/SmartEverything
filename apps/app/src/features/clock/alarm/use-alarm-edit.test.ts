import { PLANNER_ALARM_ROW, type PlannerAlarmRow } from '@smarteverything/domain';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlarmEditing } from './use-alarm-edit';

interface Held {
  readonly body: Readonly<Record<string, unknown>>;
  readonly resolve: (row: PlannerAlarmRow) => void;
  readonly reject: (error: Error) => void;
}

const api = vi.hoisted((): { readonly held: Held[] } => ({ held: [] }));
const toasts = vi.hoisted(() => ({ notify: vi.fn() }));

function heldUpdate(
  _who: unknown,
  _id: string,
  body: Readonly<Record<string, unknown>>,
): Promise<PlannerAlarmRow> {
  return new Promise<PlannerAlarmRow>((resolve, reject) => {
    api.held.push({ body, resolve, reject });
  });
}

function asStored(time: string): string {
  return time;
}

vi.mock('../../../api/planner', () => ({ updatePlannerAlarm: heldUpdate }));
vi.mock('../../../components/toast-store', () => ({
  notify: toasts.notify,
  notifyFailure: (): typeof toasts.notify => toasts.notify,
}));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../store/clock-format', () => ({ useClockLabel: (): typeof asStored => asStored }));
vi.mock('../../planner', async () => ({
  alarmLabelOf: (alarm: PlannerAlarmRow): string => alarm.label ?? 'Alarm',
  useAlarmSaves: (await import('../../planner/data/alarm-saves')).useAlarmSaves,
  usePlannerWrites: (await import('../../planner/data/writes')).usePlannerWrites,
  usePlannerClockWrites: (): object => ({}),
}));

const { EntityStore } = await import('../../../store/entity-store');
const { CommandLedger } = await import('../../../store/command-ledger');
const { useStoreSelector } = await import('../../../store/store-context');
const { StoreContext } = await import('../../../store/store-runtime');
const { keptAlarm } = await import('../../planner/data/writes');
const { useAlarmEdit } = await import('./use-alarm-edit');
const { draftOf } = await import('./alarm-draft');

const ID = 'a1b2c3d4-0000-4000-8000-000000000a01';
const STAMP = '2026-11-01T08:00:00.000Z';

const ROW = PLANNER_ALARM_ROW.parse({
  id: ID,
  profile_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  label: 'Wake up',
  time: '07:00',
  days: [1, 2, 3, 4, 5],
  once_on: null,
  skip_on: null,
  enabled: true,
  sound: { kind: 'tone', id: 'default' },
  ramp_seconds: 60,
  vibrate: true,
  snooze_minutes: 5,
  snooze_limit: null,
  challenge: { kind: 'none' },
  sunrise: null,
  smart_minutes: null,
  wake_automation_id: null,
  wake_lead_minutes: null,
  targets: [],
  watch: [],
  source: 'planner',
  created_at: STAMP,
  updated_at: STAMP,
});

interface Probe {
  editing: AlarmEditing | null;
  renders: number;
  mounts: number;
}

interface Watch {
  readonly rendered: (editing: AlarmEditing) => void;
  readonly mounted: () => void;
}

function watched(): { readonly probe: Probe; readonly watch: Watch } {
  const probe: Probe = { editing: null, renders: 0, mounts: 0 };
  return {
    probe,
    watch: {
      rendered: (editing): void => {
        probe.editing = editing;
        probe.renders += 1;
      },
      mounted: (): void => {
        probe.mounts += 1;
      },
    },
  };
}

function Editor({ watch }: { readonly watch: Watch }): ReactNode {
  const alarm = useStoreSelector((state) => state.tables.planner_alarms.byId[ID] ?? null);
  watch.rendered(
    useAlarmEdit({
      person: null,
      alarm,
      fresh: draftOf(ROW),
      onCreated: () => undefined,
      onDeleted: () => undefined,
    }),
  );
  useEffect(() => {
    watch.mounted();
  }, [watch]);
  return null;
}

function container(): object {
  return {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): undefined => undefined,
  };
}

function mounted(): { readonly probe: Probe; readonly unmount: () => void } {
  const store = new EntityStore();
  keptAlarm(store)(ROW);
  const { probe, watch } = watched();
  const root = createRoot(container());
  act(() => {
    root.render(
      createElement(
        StoreContext.Provider,
        { value: { store, ledger: new CommandLedger(store) } },
        createElement(Editor, { watch }),
      ),
    );
  });
  return {
    probe,
    unmount: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function editing(probe: Probe): AlarmEditing {
  if (probe.editing === null) throw new Error('The editor never rendered.');
  return probe.editing;
}

async function answer(index: number, row: PlannerAlarmRow): Promise<void> {
  await act(async () => {
    api.held[index]?.resolve(row);
    await Promise.resolve();
  });
}

beforeEach(() => {
  api.held.length = 0;
  toasts.notify.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editing an alarm while a save is in flight', () => {
  it('keeps the fields editable, keeps typed values and saves the later edits in order', async () => {
    const { probe, unmount } = mounted();
    act(() => {
      editing(probe).change({ snooze_minutes: 6 });
    });
    expect(api.held.map((held) => held.body)).toEqual([{ snooze_minutes: 6 }]);
    act(() => {
      editing(probe).change({ snooze_minutes: 7 });
      editing(probe).change({ label: 'Gym' });
    });
    expect(editing(probe).busy).toBe(false);
    expect(editing(probe).draft.snooze_minutes).toBe(7);
    expect(editing(probe).draft.label).toBe('Gym');
    expect(api.held).toHaveLength(1);
    await answer(0, { ...ROW, snooze_minutes: 6 });
    expect(editing(probe).draft.snooze_minutes).toBe(7);
    expect(editing(probe).draft.label).toBe('Gym');
    expect(api.held.map((held) => held.body)).toEqual([
      { snooze_minutes: 6 },
      { snooze_minutes: 7, label: 'Gym' },
    ]);
    await answer(1, { ...ROW, snooze_minutes: 7, label: 'Gym' });
    expect(editing(probe).draft.snooze_minutes).toBe(7);
    expect(editing(probe).draft.label).toBe('Gym');
    expect(probe.mounts).toBe(1);
    expect(probe.renders).toBeLessThanOrEqual(8);
    unmount();
  });

  it('shows a refused save loudly with its reason and puts the saved value back', async () => {
    const { probe, unmount } = mounted();
    act(() => {
      editing(probe).change({ vibrate: false });
    });
    expect(editing(probe).draft.vibrate).toBe(false);
    const refused = new Error('The hub refused the change');
    await act(async () => {
      api.held[0]?.reject(refused);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toasts.notify).toHaveBeenCalledWith(
      expect.objectContaining({ error: refused, tone: 'critical' }),
    );
    expect(editing(probe).draft.vibrate).toBe(true);
    expect(probe.mounts).toBe(1);
    unmount();
  });
});
