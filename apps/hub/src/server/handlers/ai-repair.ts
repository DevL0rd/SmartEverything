import {
  AI_REPAIR_SETTINGS,
  API_ENDPOINTS as E,
  ApiError,
  type AiRepairPage,
  type AiRepairAdmission,
  type AiRepairPatchRequest,
  type AiRepairSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  repairEventId,
  repairEvidenceOf,
  type RepairDispatch,
} from '../../assistant/repair-dispatch';
import { sealRepairSource } from '../../assistant/repair-source';
import type { Store } from '../../store/store';
import { directClient, profileIdOf, type Caller } from '../auth';
import { bound, type Routes } from '../router';

const SETTING = 'ai-repair';
const ENABLED_AT = 'ai-repair-enabled-at';
const START = z.strictObject({ at: z.iso.datetime() });
const OFF: AiRepairSettings = { enabled: false };

function requireOwnerApp(caller: Caller): void {
  if (directClient(caller)?.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the owner can change AI repair in the app.');
  }
}

export function readAiRepairSettings(store: Pick<Store, 'settingsKv'>): AiRepairSettings {
  const saved = store.settingsKv.read(SETTING);
  return saved === null ? OFF : AI_REPAIR_SETTINGS.parse(saved);
}

export function repairEnabledAt(store: Pick<Store, 'settingsKv'>): string | null {
  const saved = store.settingsKv.read(ENABLED_AT);
  return saved === null ? null : START.parse(saved).at;
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

function retainedError(
  store: Store,
  fingerprint: string,
  profileId: string,
): {
  readonly component: string;
  readonly evidence: ReturnType<typeof repairEvidenceOf>;
} {
  const id = store.aiRepairInbox.latestLogId(fingerprint);
  const retained =
    id === null
      ? null
      : store.runtimeLogs.around({ owner: true, profileId }, { id, before: 0, after: 0 });
  if (retained === null) throw new ApiError('not_found', 'The error details have expired.');
  return { component: retained.anchor.component, evidence: repairEvidenceOf(retained.anchor) };
}

async function proposePatch(
  store: Store,
  repair: RepairPort | undefined,
  caller: Caller,
  {
    fingerprint,
    request,
  }: { readonly fingerprint: string; readonly request: AiRepairPatchRequest },
): Promise<AiRepairAdmission> {
  requireOwnerApp(caller);
  if (repair?.existingPatch === undefined) throw new ApiError('conflict', 'AI repair is starting.');
  const profileId = profileIdOf(store, caller);
  const id = repairEventId(`patch:${fingerprint}`, request.requestId);
  const existing = repair.existingPatch(id, profileId, request);
  if (existing !== undefined) return existing;
  const error = retainedError(store, fingerprint, profileId);
  const patch = await sealRepairSource(request);
  return (
    repair.existingPatch(id, profileId, request) ??
    repair.admit({
      id,
      fingerprint,
      profileId,
      ...error,
      kind: 'manual',
      origin: 'ordinary',
      recipient: { active: null, previousChatId: null },
      patch,
    })
  );
}

export function aiRepairRoutes(store: Store, repair?: RepairPort): Routes<RepairRoute> {
  return {
    readAiRepairSettings: bound(E.readAiRepairSettings, () => readAiRepairSettings(store)),
    updateAiRepairSettings: bound(E.updateAiRepairSettings, ({ body, caller }) => {
      requireOwnerApp(caller);
      store.write(() => {
        if (body.enabled && !readAiRepairSettings(store).enabled)
          store.settingsKv.save(ENABLED_AT, { at: store.now().toISOString() });
        store.settingsKv.save(SETTING, body);
      });
      return body;
    }),
    listAiRepairGroups: bound(E.listAiRepairGroups, ({ query, caller }): AiRepairPage => {
      const page = store.aiRepairInbox.list(query);
      if (!readAiRepairSettings(store).enabled) return { ...page, automaticHold: 'disabled' };
      return repair?.available(profileIdOf(store, caller)) === true
        ? page
        : { ...page, automaticHold: 'unavailable' };
    }),
    dismissAiRepairGroups: bound(E.dismissAiRepairGroups, ({ body }) => ({
      dismissed: store.aiRepairInbox.dismiss(body),
    })),
    diagnoseAiRepairGroup: bound(E.diagnoseAiRepairGroup, ({ params, body, caller }) => {
      requireOwnerApp(caller);
      if (repair === undefined) throw new ApiError('conflict', 'AI repair is starting.');
      const profileId = profileIdOf(store, caller);
      const eventId = repairEventId(params.fingerprint, body.requestId);
      const existing = repair.existing(eventId, profileId);
      if (existing !== undefined) return existing;
      return repair.admit({
        id: eventId,
        fingerprint: params.fingerprint,
        profileId,
        ...retainedError(store, params.fingerprint, profileId),
        kind: 'manual',
        origin: 'ordinary',
        recipient: { active: null, previousChatId: null },
      });
    }),
    proposeAiRepairPatch: bound(E.proposeAiRepairPatch, ({ params, body, caller }) =>
      proposePatch(store, repair, caller, { fingerprint: params.fingerprint, request: body }),
    ),
  };
}
