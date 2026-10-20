import {
  ApiError,
  TREADMILL_GOALS,
  TREADMILL_SETTINGS,
  type ClientRow,
  type DeviceRow,
  type TreadmillAction,
  type TreadmillActionResult,
  type TreadmillSettings,
  JSON_VALUE,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { LocalDevices } from '../local-devices';
import type { WatchBridges } from '../watch-bridge';
import type { TreadmillActionBroker } from './broker';
import { entrySettingsOf } from './config';
import { recomputeSessions } from './figures';
import type { Fleet } from './fleet';
import type { TreadmillHealth } from './health';
import type { Viewer } from './views';

export interface ActDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly bridges: Pick<WatchBridges, 'takeOver'>;
  readonly health: TreadmillHealth;
  readonly broker: Pick<TreadmillActionBroker, 'run'>;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface Actor extends Viewer {
  readonly client: ClientRow;
  readonly phone: boolean;
}

const OK: TreadmillActionResult = { ok: true, detail: 'Done.' };

function ownerOnly(actor: Actor, what: string): void {
  if (actor.role !== 'owner') {
    throw new ApiError('forbidden', `Only the owner may ${what}.`);
  }
}

function saveSettings(deps: ActDeps, device: DeviceRow, settings: TreadmillSettings): void {
  const state = deps.fleet.of(device);
  const { entry } = state;
  deps.store.localDevices.updateConfig(entry.externalId, {
    ...entry.config,
    settings: JSON_VALUE.parse(TREADMILL_SETTINGS.parse(settings)),
  });
  state.useEntry(deps.store.localDevices.byExternalId(entry.externalId));
}

function mergedPolicy(
  before: TreadmillSettings['policy'],
  change: NonNullable<ConfigureChange['policy']>,
): TreadmillSettings['policy'] {
  return {
    remoteStart: change.remoteStart ?? before.remoteStart,
    remoteWho: change.remoteWho ?? before.remoteWho,
    remoteMaxKmh: change.remoteMaxKmh ?? before.remoteMaxKmh,
    stopWithoutSteps: change.stopWithoutSteps ?? before.stopWithoutSteps,
    remoteIncline: change.remoteIncline ?? before.remoteIncline,
    remoteInclineMax: change.remoteInclineMax ?? before.remoteInclineMax,
  };
}

type ConfigureChange = Extract<TreadmillAction, { action: 'configure' }>['settings'];

function configure(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  change: ConfigureChange,
): TreadmillActionResult {
  ownerOnly(actor, 'change the treadmill settings');
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  saveSettings(deps, device, {
    ...before,
    gradePercent: change.gradePercent ?? before.gradePercent,
    inclineScale: change.inclineScale ?? before.inclineScale,
    runSwitchKmh: change.runSwitchKmh ?? before.runSwitchKmh,
    stayConnected: change.stayConnected ?? before.stayConnected,
    presence: change.presence ?? before.presence,
    lubricationDays: change.lubricationDays ?? before.lubricationDays,
    policy: mergedPolicy(before.policy, change.policy ?? {}),
  });
  if (change.inclineScale !== undefined && change.inclineScale !== before.inclineScale) {
    const state = deps.fleet.of(device);
    const updated = recomputeSessions(
      deps,
      device.id,
      entrySettingsOf(state.entry),
      state.runtime.identity.inclineMaxPercent !== null,
    );
    deps.log.info('treadmill.sessions_recomputed', { device: device.id, sessions: updated.length });
  }
  deps.log.info('treadmill.settings_changed', { device: device.id, by: actor.clientId });
  return OK;
}

function setGoal(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'set_goal' }>,
): TreadmillActionResult {
  const personId = request.personId ?? actor.profileId;
  if (personId !== actor.profileId) {
    ownerOnly(actor, 'set another person’s treadmill goals');
  }
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  const current = before.goals[personId] ?? TREADMILL_GOALS.parse({});
  saveSettings(deps, device, {
    ...before,
    goals: { ...before.goals, [personId]: TREADMILL_GOALS.parse({ ...current, ...request.goals }) },
  });
  return OK;
}

function assertSessionOwned(actor: Actor, walkerProfileId: string | null): void {
  if (actor.role !== 'owner' && walkerProfileId !== actor.profileId) {
    throw new ApiError('forbidden', 'This session belongs to another person.');
  }
}

function assignWalker(
  deps: ActDeps,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'assign_walker' }>,
): TreadmillActionResult {
  const session = deps.store.treadmillSessions.byId(request.sessionId);
  assertSessionOwned(actor, session.walkerProfileId);
  if (request.personId !== null) {
    deps.store.profiles.byId(request.personId);
  }
  deps.store.write(() => {
    deps.store.treadmillSessions.reassign(session.id, request.personId);
    deps.health.move({ ...session, walkerProfileId: request.personId }, session.walkerProfileId);
  });
  return OK;
}

function forgetSession(
  deps: ActDeps,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'forget_session' }>,
): TreadmillActionResult {
  const session = deps.store.treadmillSessions.byId(request.sessionId);
  assertSessionOwned(actor, session.walkerProfileId);
  deps.store.write(() => {
    deps.health.forget(session);
    deps.store.treadmillSessions.remove(session.id);
  });
  return OK;
}

function setWalker(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  personId: string | null,
): Promise<TreadmillActionResult> {
  if (personId !== null) {
    deps.store.profiles.byId(personId);
  }
  const currentOk = actor.role === 'owner' || personId === actor.profileId || personId === null;
  if (!currentOk) {
    throw new ApiError('forbidden', 'Only the owner puts another person on the belt.');
  }
  return deps.local.observe(device.external_id, { walkerProfileId: personId }).then(() => OK);
}

async function takeOver(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
): Promise<TreadmillActionResult> {
  if (!actor.phone) {
    throw new ApiError(
      'forbidden',
      'Only a phone next to the treadmill can take over the Bluetooth link. Open the treadmill settings on that phone.',
    );
  }
  const bridge = await deps.bridges.takeOver(device, actor.client);
  return { ok: true, detail: `${bridge.clientName} now holds the Bluetooth link.` };
}

export async function actTreadmill(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  action: TreadmillAction,
): Promise<TreadmillActionResult> {
  switch (action.action) {
    case 'assign_walker':
      return assignWalker(deps, actor, action);
    case 'set_walker':
      return setWalker(deps, device, actor, action.personId);
    case 'set_goal':
      return setGoal(deps, device, actor, action);
    case 'configure':
      return configure(deps, device, actor, action.settings);
    case 'mark_lubricated':
      ownerOnly(actor, 'mark the belt as lubricated');
      saveSettings(deps, device, {
        ...entrySettingsOf(deps.fleet.of(device).entry),
        lubricatedAt: deps.now().toISOString(),
      });
      return OK;
    case 'take_over':
      return takeOver(deps, device, actor);
    case 'forget_session':
      return forgetSession(deps, actor, action);
    case 'raw_log':
      ownerOnly(actor, 'read the raw frame log');
      deps.fleet.of(device).setRawLog(action.enabled);
      return OK;
  }
}
