import {
  ApiError,
  type AppViewResult,
  type ClientRow,
  type ShowInAppInput,
  type ShowInAppResult,
} from '@smarteverything/domain';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { AppViewAsk, AppViewBroker, AppViewOutcome } from './broker';
import type { AppViewClient } from './app-view-units';

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

function appsOf(clients: readonly AppViewClient[], personId: string): readonly ClientRow[] {
  return clients.filter((entry) => entry.profileId === personId).map((entry) => entry.client);
}

function named(apps: readonly ClientRow[]): string {
  return apps.map((app) => `${app.name} (${app.id})`).join(', ');
}

function namedApp(clients: readonly AppViewClient[], caller: Caller, appId: string): ClientRow {
  const entry = clients.find((candidate) => candidate.client.id === appId);
  if (entry === undefined) {
    throw new ApiError('not_found', 'No paired app has that id.');
  }
  const app = entry.client;
  const own = entry.profileId === profileIdOf(caller);
  if (roleOfCaller(caller) !== 'owner' && !own) {
    throw new ApiError('forbidden', 'Only an owner may show things in another person’s app.');
  }
  return app;
}

function openApp(desk: AppViewDesk, clients: readonly AppViewClient[], caller: Caller): ClientRow {
  const open = appsOf(clients, profileIdOf(caller)).filter((app) => desk.foreground().has(app.id));
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

function requestOf(input: ShowInAppInput): AppViewAsk {
  switch (input.action) {
    case 'open':
      return { action: 'open', target: input.target, focus: input.focus ?? null };
    case 'highlight':
      return { action: 'highlight', focus: input.focus };
    case 'dismiss':
      return { action: 'dismiss', target: null, focus: null };
  }
}

export async function showInApp(
  desk: AppViewDesk,
  caller: Caller,
  input: ShowInAppInput,
): Promise<ShowInAppResult> {
  const request = requestOf(input);
  const clients = await desk.store.host.read('appViewClients', null);
  const app =
    input.appId === undefined
      ? openApp(desk, clients, caller)
      : namedApp(clients, caller, input.appId);
  return resultOf(app, await desk.broker.ask(app.id, request));
}
