import type { GoogleAccount } from './account';
import type { Reply } from './reply';
import type { RequestContext } from './request';

interface RouteBase {
  readonly method: string;
  readonly host: string;
  readonly pattern: RegExp;
}

export interface PublicRoute extends RouteBase {
  readonly auth: null;
  readonly handle: (context: RequestContext) => Reply;
}

export interface AuthedRoute extends RouteBase {
  readonly auth: readonly string[];
  readonly handle: (context: RequestContext, account: GoogleAccount) => Reply;
}

export type Route = PublicRoute | AuthedRoute;

export const CALENDAR_HOST = 'www.googleapis.com';
export const TASKS_HOST = 'tasks.googleapis.com';
export const TOKEN_HOST = 'oauth2.googleapis.com';
export const USERINFO_HOST = 'openidconnect.googleapis.com';

export function decodeGroup(context: RequestContext, index: number): string {
  return decodeURIComponent(context.groups[index] ?? '');
}

export function authed(route: AuthedRoute): Route {
  return route;
}

export function publicRoute(route: PublicRoute): Route {
  return route;
}
