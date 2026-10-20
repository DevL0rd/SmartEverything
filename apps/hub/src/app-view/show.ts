import {
  ApiError,
  type AppViewResult,
  type ClientRow,
  type ShowInAppInput,
  type ShowInAppResult,
} from '@smarteverything/domain';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { AppViewBroker, AppViewOutcome } from './broker';

export interface AppViewDesk {
  readonly broker: Pick<AppViewBroker, 'ask' | 'answer'>;
  readonly store: Store;
  readonly foreground: () => ReadonlySet<string>;
}

type Refused = Extract<AppViewResult, { readonly ok: false }>['reason'];

const REFUSAL_TEXT: Readonly<Record<Refused, string>> = {
  app_not_in_front: 'The app is open but not in front, or its screen is off.',
  target_not_found: 'The app has no page or item for that target.',
};

function ownAppId(caller: Caller): string | null {
  return caller.kind === 'client' ? caller.client.id : null;
}

function appsOf(desk: AppViewDesk, personId: string): readonly ClientRow[] {
  return desk.store.clients
    .list()
    .filter((client) => desk.store.profiles.activeOf(client.id).id === personId);
}

function named(apps: readonly ClientRow[]): string {
  return apps.map((app) => `${app.name} (${app.id})`).join(', ');
}

function namedApp(desk: AppViewDesk, caller: Caller, appId: string): ClientRow {
  const app = desk.store.clients.find(appId);
  if (app === undefined) {
    throw new ApiError('not_found', 'No paired app has that id.');
  }
  const own = desk.store.profiles.activeOf(app.id).id === profileIdOf(desk.store, caller);
  if (roleOfCaller(caller) !== 'owner' && !own) {
    throw new ApiError('forbidden', 'Only an owner may show things in another person’s app.');
  }
  return app;
}

function openApp(desk: AppViewDesk, caller: Caller): ClientRow {
  const open = appsOf(desk, profileIdOf(desk.store, caller)).filter((app) =>
    desk.foreground().has(app.id),
  );
  const own = open.find((app) => app.id === ownAppId(caller));
  const [only, ...others] = open;
  if (own !== undefined) return own;
  if (only === undefined) {
    throw new ApiError('conflict', 'None of this person’s apps is open in front right now.');
  }
  if (others.length > 0) {
    throw new ApiError(
      'conflict',
      `Several of this person’s apps are open; name one with appId: ${named(open)}.`,
    );
  }
  return only;
}

function resultOf(app: ClientRow, outcome: AppViewOutcome): ShowInAppResult {
  switch (outcome.kind) {
    case 'answered':
      return outcome.result.ok
        ? { ...outcome.result, app: app.name }
        : {
            ok: false,
            app: app.name,
            reason: outcome.result.reason,
            detail: REFUSAL_TEXT[outcome.result.reason],
          };
    case 'not_reached':
      return {
        ok: false,
        app: app.name,
        reason: 'not_connected',
        detail: `${app.name} has no live link to the server right now; it may be closed.`,
      };
    case 'unanswered':
      return {
        ok: false,
        app: app.name,
        reason: 'no_answer',
        detail: `${app.name} did not answer in time.`,
      };
  }
}

export async function showInApp(
  desk: AppViewDesk,
  caller: Caller,
  input: ShowInAppInput,
): Promise<ShowInAppResult> {
  if (input.action !== 'dismiss' && input.target === undefined) {
    throw new ApiError('invalid_request', `${input.action} needs a target.`);
  }
  const app =
    input.appId === undefined ? openApp(desk, caller) : namedApp(desk, caller, input.appId);
  const outcome = await desk.broker.ask(app.id, {
    action: input.action,
    target: input.target ?? null,
    focus: input.focus ?? null,
  });
  return resultOf(app, outcome);
}
