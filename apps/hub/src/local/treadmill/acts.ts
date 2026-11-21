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
import type { Fleet } from './fleet';
import type { Viewer } from './views';

export interface ActDeps {
  readonly store: Pick<Store, 'host'>;
  readonly fleet: Fleet;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly bridges: Pick<WatchBridges, 'takeOver'>;
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

async function saveSettings(
  deps: ActDeps,
  device: DeviceRow,
  settings: TreadmillSettings,
): Promise<void> {
  const state = deps.fleet.of(device);
  const { entry } = state;
  state.useEntry(
    await deps.store.host.write('localConfig', {
      externalId: entry.externalId,
      config: { ...entry.config, settings: JSON_VALUE.parse(TREADMILL_SETTINGS.parse(settings)) },
    }),
  );
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

async function configure(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  change: ConfigureChange,
): Promise<TreadmillActionResult> {
  ownerOnly(actor, 'change the treadmill settings');
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  await saveSettings(deps, device, {
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
    const updated = await deps.store.host.write('treadmillRecompute', {
      deviceId: device.id,
      settings: entrySettingsOf(state.entry),
      hasIncline: state.runtime.identity.inclineMaxPercent !== null,
    });
    deps.log.info('treadmill.sessions_recomputed', { device: device.id, sessions: updated });
  }
  deps.log.info('treadmill.settings_changed', { device: device.id, by: actor.clientId });
  return OK;
}

async function setGoal(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'set_goal' }>,
): Promise<TreadmillActionResult> {
  const personId = request.personId ?? actor.profileId;
  if (personId !== actor.profileId) {
    ownerOnly(actor, 'set another person’s treadmill goals');
  }
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  const current = before.goals[personId] ?? TREADMILL_GOALS.parse({});
  await saveSettings(deps, device, {
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

async function assignWalker(
  deps: ActDeps,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'assign_walker' }>,
): Promise<TreadmillActionResult> {
  const session = await deps.store.host.call('treadmillSessions', 'byId', request.sessionId);
  assertSessionOwned(actor, session.walkerProfileId);
  if (request.personId !== null) {
    await deps.store.host.call('profiles', 'byId', request.personId);
  }
  await deps.store.host.write('treadmillAssign', { session, personId: request.personId });
  return OK;
}

async function forgetSession(
  deps: ActDeps,
  actor: Actor,
  request: Extract<TreadmillAction, { action: 'forget_session' }>,
): Promise<TreadmillActionResult> {
  const session = await deps.store.host.call('treadmillSessions', 'byId', request.sessionId);
  assertSessionOwned(actor, session.walkerProfileId);
  await deps.store.host.write('treadmillForget', session);
  return OK;
}

async function setWalker(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  personId: string | null,
): Promise<TreadmillActionResult> {
  if (personId !== null) {
    await deps.store.host.call('profiles', 'byId', personId);
  }
  const currentOk = actor.role === 'owner' || personId === actor.profileId || personId === null;
  if (!currentOk) {
    throw new ApiError('forbidden', 'Only the owner puts another person on the belt.');
  }
  await deps.local.observe(device.external_id, { walkerProfileId: personId });
  return OK;
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
      await saveSettings(deps, device, {
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
