import {
  API_ENDPOINTS as E,
  type GoogleAccountRow,
  type GoogleSyncLogEntry,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export type GoogleLinkStarted = z.output<(typeof E)['googleLinkStart']['response']>;

function person(personId: string | undefined): { readonly personId?: string } {
  return personId === undefined ? {} : { personId };
}

export async function startGoogleLink(
  personId: string | undefined,
  body: Body<'googleLinkStart'>,
): Promise<GoogleLinkStarted> {
  return api().call(E.googleLinkStart, { query: person(personId), body });
}

export async function finishGoogleLink(
  personId: string | undefined,
  body: Body<'googleLinkFinish'>,
): Promise<GoogleAccountRow> {
  return api().call(E.googleLinkFinish, { query: person(personId), body });
}

export async function unlinkGoogle(personId: string | undefined): Promise<void> {
  await api().call(E.googleUnlink, { query: person(personId) });
}

export async function syncGoogle(personId: string | undefined): Promise<void> {
  await api().call(E.googleSync, { query: person(personId) });
}

export async function readGoogleSyncLog(
  personId: string | undefined,
  before: string | undefined,
): Promise<GoogleSyncLogEntry[]> {
  return api().call(E.googleSyncLog, {
    query: { ...person(personId), ...(before === undefined ? {} : { before }) },
  });
}

export async function storeGoogleApp(body: Body<'googleApp'>): Promise<void> {
  await api().call(E.googleApp, { body });
}

export async function updateGoogleAccount(
  personId: string | undefined,
  body: Body<'googleAccount'>,
): Promise<GoogleAccountRow> {
  return api().call(E.googleAccount, { query: person(personId), body });
}

export async function chooseGoogleTask(
  personId: string | undefined,
  logId: string,
  googleId: string,
): Promise<GoogleSyncLogEntry> {
  return api().call(E.googleChoice, { query: person(personId), body: { logId, googleId } });
}
