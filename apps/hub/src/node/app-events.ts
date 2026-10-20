import {
  APP_EVENT_TITLE_LONGEST,
  type AppEvent,
  type SessionApp,
  type WindowRow,
  type WindowsState,
} from '@smarteverything/domain';

interface OpenApp {
  readonly app: SessionApp;
  readonly title: string | null;
}

export interface AppEventBatch {
  readonly baseline: boolean;
  readonly events: readonly AppEvent[];
}

function titleOf(rows: readonly WindowRow[]): string | null {
  const row = rows.find((candidate) => candidate.focused) ?? rows[0];
  return row === undefined || row.title === '' ? null : row.title.slice(0, APP_EVENT_TITLE_LONGEST);
}

function openAppsOf(state: WindowsState): Map<string, OpenApp> {
  const grouped = new Map<string, { app: SessionApp; rows: WindowRow[] }>();
  for (const row of state.windows) {
    if (row.app === null) continue;
    const group = grouped.get(row.app.id) ?? { app: row.app, rows: [] };
    group.rows.push(row);
    grouped.set(row.app.id, group);
  }
  return new Map(
    [...grouped].map(([id, { app, rows }]) => [id, { app, title: titleOf(rows) }] as const),
  );
}

function eventOf(kind: AppEvent['kind'], { app, title }: OpenApp): AppEvent {
  return { kind, app, title };
}

function lookup(apps: ReadonlyMap<string, OpenApp>, id: string | null): OpenApp | undefined {
  return id === null ? undefined : apps.get(id);
}

function focusedIdOf(state: WindowsState, locked: boolean | null): string | null {
  return locked === true ? null : (state.windows.find((row) => row.focused)?.app?.id ?? null);
}

export class AppEventTracker {
  private open: ReadonlyMap<string, OpenApp> | null = null;
  private focused: string | null = null;

  reset(): void {
    this.open = null;
    this.focused = null;
  }

  observe(state: WindowsState, locked: boolean | null): AppEventBatch {
    const open = openAppsOf(state);
    const focused = focusedIdOf(state, locked);
    const before = this.open;
    const events = before === null ? this.seed(open, focused) : this.diff(before, open, focused);
    this.open = open;
    this.focused = focused;
    return { baseline: before === null, events };
  }

  private seed(open: ReadonlyMap<string, OpenApp>, focused: string | null): AppEvent[] {
    const front = lookup(open, focused);
    return [
      ...[...open.values()].map((app) => eventOf('opened', app)),
      ...(front === undefined ? [] : [eventOf('focused', front)]),
    ];
  }

  private diff(
    before: ReadonlyMap<string, OpenApp>,
    open: ReadonlyMap<string, OpenApp>,
    focused: string | null,
  ): AppEvent[] {
    const lostFront = this.focused === focused ? undefined : lookup(before, this.focused);
    const gainedFront = this.focused === focused ? undefined : lookup(open, focused);
    return [
      ...(lostFront === undefined ? [] : [eventOf('unfocused', lostFront)]),
      ...[...before].filter(([id]) => !open.has(id)).map(([, gone]) => eventOf('closed', gone)),
      ...[...open].filter(([id]) => !before.has(id)).map(([, added]) => eventOf('opened', added)),
      ...(gainedFront === undefined ? [] : [eventOf('focused', gainedFront)]),
    ];
  }
}
