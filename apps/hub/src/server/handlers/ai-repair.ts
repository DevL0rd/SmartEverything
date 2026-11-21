import {
  API_ENDPOINTS as E,
  ApiError,
  type AiRepairPage,
  type AiRepairAdmission,
  type AiRepairPatchRequest,
} from '@smarteverything/domain';
import type { z } from 'zod';
import {
  repairEventId,
  repairEvidenceOf,
  retainedLogOf,
  type RepairDispatch,
  type RetainedLog,
} from '../../assistant/repair-dispatch';
import type { LogStore } from '../../logs/log-store';
import { sealRepairSource } from '../../assistant/repair-source';
import type { HubLayout } from '../../data-layout';
import type { Store } from '../../store/store';
import { directClient, profileIdOf, type Caller } from '../auth';
import { bound, type Routes } from '../router';
import type { AiRepairState } from './ai-repair-units';

type AiRepairQuery = z.output<(typeof E)['listAiRepairGroups']['query']>;

function requireOwnerApp(caller: Caller): void {
  if (directClient(caller)?.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the owner can change AI repair in the app.');
  }
}

export async function readAiRepairState(store: Pick<Store, 'host'>): Promise<AiRepairState> {
  return store.host.read('aiRepairState', null);
}

type RepairRoute =
  | 'readAiRepairSettings'
  | 'updateAiRepairSettings'
  | 'listAiRepairGroups'
  | 'dismissAiRepairGroups'
  | 'diagnoseAiRepairGroup'
  | 'proposeAiRepairPatch';

type RepairPort = Pick<RepairDispatch, 'admit' | 'available' | 'existing'> &
  Partial<Pick<RepairDispatch, 'existingPatch'>>;

type RepairLogs = Pick<LogStore, 'around'>;

async function retainedError(
  store: Store,
  logs: RepairLogs,
  fingerprint: string,
  profileId: string,
): Promise<{
  readonly component: string;
  readonly evidence: ReturnType<typeof repairEvidenceOf>;
  readonly retained: RetainedLog;
}> {
  const retained = await retainedLogOf(store, logs, fingerprint, profileId);
  if (retained === null) throw new ApiError('not_found', 'The error details have expired.');
  return {
    component: retained.anchor.component,
    evidence: repairEvidenceOf(retained.anchor),
    retained,
  };
}

async function proposePatch(
  store: Store,
  repair: RepairPort | undefined,
  caller: Caller,
  {
    logs,
    layout,
    fingerprint,
    request,
  }: {
    readonly logs: RepairLogs;
    readonly layout: HubLayout;
    readonly fingerprint: string;
    readonly request: AiRepairPatchRequest;
  },
): Promise<AiRepairAdmission> {
  requireOwnerApp(caller);
  if (repair?.existingPatch === undefined) throw new ApiError('conflict', 'AI repair is starting.');
  const profileId = profileIdOf(caller);
  const id = repairEventId(`patch:${fingerprint}`, request.requestId);
  const existing = await repair.existingPatch(id, profileId, request);
  if (existing !== undefined) return existing;
  const error = await retainedError(store, logs, fingerprint, profileId);
  const patch = await sealRepairSource(layout, request);
  return (
    (await repair.existingPatch(id, profileId, request)) ??
    (await repair.admit({
      id,
      fingerprint,
      profileId,
      ...error,
      kind: 'manual',
      origin: 'ordinary',
      recipient: { active: null, previousChatId: null },
      patch,
    }))
  );
}

async function repairPage(
  store: Store,
  repair: RepairPort | undefined,
  query: AiRepairQuery,
  caller: Caller,
): Promise<AiRepairPage> {
  const page = await store.host.call('aiRepairInbox', 'list', query);
  if (!(await readAiRepairState(store)).settings.enabled)
    return { ...page, automaticHold: 'disabled' };
  return (await repair?.available(profileIdOf(caller))) === true
    ? page
    : { ...page, automaticHold: 'unavailable' };
}

export function aiRepairRoutes(
  store: Store,
  logs: RepairLogs,
  layout: HubLayout,
  repair?: RepairPort,
): Routes<RepairRoute> {
  return {
    readAiRepairSettings: bound(
      E.readAiRepairSettings,
      async () => (await readAiRepairState(store)).settings,
    ),
    updateAiRepairSettings: bound(E.updateAiRepairSettings, ({ body, caller }) => {
      requireOwnerApp(caller);
      return store.host.write('aiRepairSettingsSave', body);
    }),
    listAiRepairGroups: bound(E.listAiRepairGroups, ({ query, caller }) =>
      repairPage(store, repair, query, caller),
    ),
    dismissAiRepairGroups: bound(E.dismissAiRepairGroups, async ({ body }) => ({
      dismissed: await store.host.call('aiRepairInbox', 'dismiss', body),
    })),
    diagnoseAiRepairGroup: bound(E.diagnoseAiRepairGroup, async ({ params, body, caller }) => {
      requireOwnerApp(caller);
      if (repair === undefined) throw new ApiError('conflict', 'AI repair is starting.');
      const profileId = profileIdOf(caller);
      const eventId = repairEventId(params.fingerprint, body.requestId);
      const existing = await repair.existing(eventId, profileId);
      if (existing !== undefined) return existing;
      return repair.admit({
        id: eventId,
        fingerprint: params.fingerprint,
        profileId,
        ...(await retainedError(store, logs, params.fingerprint, profileId)),
        kind: 'manual',
        origin: 'ordinary',
        recipient: { active: null, previousChatId: null },
      });
    }),
    proposeAiRepairPatch: bound(E.proposeAiRepairPatch, ({ params, body, caller }) =>
      proposePatch(store, repair, caller, {
        logs,
        layout,
        fingerprint: params.fingerprint,
        request: body,
      }),
    ),
  };
}
