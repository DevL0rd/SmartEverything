import type { FakeClock } from './clock';
import { AccountCalendars } from './calendar-store';
import type { ChannelTarget } from './channels';
import { TaskListStore, type TasksDeps } from './tasks-store';
import { apiFailure } from './reply';

export interface AccountDeps {
  readonly clock: FakeClock;
  readonly nextServerId: () => number;
  readonly notify: (email: string, target: ChannelTarget) => void;
  readonly honourTasksIfMatch: boolean;
  readonly tasksUpdatedMinInclusive: boolean;
}

export class AccountTasks {
  private readonly lists = new Map<string, TaskListStore>();
  private readonly deps: TasksDeps;

  constructor(deps: TasksDeps) {
    this.deps = deps;
    this.addList('My Tasks');
  }

  addList(title: string, id?: string): TaskListStore {
    const listId = id ?? `list-${String(this.deps.nextServerId())}`;
    if (this.lists.has(listId)) throw new Error(`Task list ${listId} already exists.`);
    const list = new TaskListStore(listId, title, this.deps);
    this.lists.set(listId, list);
    return list;
  }

  list(id: string): TaskListStore {
    const resolved = id === '@default' ? [...this.lists.keys()][0] : id;
    const list = resolved === undefined ? undefined : this.lists.get(resolved);
    if (list === undefined) throw apiFailure(404, 'Task list not found.', 'notFound');
    return list;
  }

  all(): readonly TaskListStore[] {
    return [...this.lists.values()];
  }
}

export class GoogleAccount {
  readonly email: string;
  readonly calendars: AccountCalendars;
  readonly tasks: AccountTasks;

  constructor(email: string, deps: AccountDeps) {
    this.email = email;
    this.calendars = new AccountCalendars({
      clock: deps.clock,
      email,
      nextServerId: deps.nextServerId,
      eventsChanged: (calendarId): void => {
        deps.notify(email, { kind: 'events', calendarId });
      },
      listChanged: (): void => {
        deps.notify(email, { kind: 'calendarList' });
      },
    });
    this.tasks = new AccountTasks({
      clock: deps.clock,
      nextServerId: deps.nextServerId,
      honourIfMatch: deps.honourTasksIfMatch,
      updatedMinInclusive: deps.tasksUpdatedMinInclusive,
    });
  }
}

export class AccountRegistry {
  private readonly accounts = new Map<string, GoogleAccount>();
  private readonly deps: AccountDeps;

  constructor(deps: AccountDeps) {
    this.deps = deps;
  }

  forEmail(email: string): GoogleAccount {
    const existing = this.accounts.get(email);
    if (existing !== undefined) return existing;
    const created = new GoogleAccount(email, this.deps);
    this.accounts.set(email, created);
    return created;
  }
}
