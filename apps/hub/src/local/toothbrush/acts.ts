import {
  ApiError,
  BRUSHING_GOAL,
  type BrushAction,
  type BrushActionResult,
  type BrushSettings,
  type BrushSettingsChange,
  type ClientRow,
  type DeviceRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { LocalDevices } from '../local-devices';
import type { WatchBridges } from '../watch-bridge';
import { ownsSessions, type Viewer } from './access';
import type { BrushBrand } from './brand';
import type { BrushActionBroker } from './broker';
import { entrySettingsOf } from './config';
import type { Fleet } from './fleet';
import { ownerOnly } from './view-deps';

export interface ActDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly bridges: Pick<WatchBridges, 'takeOver'>;
  readonly broker: Pick<BrushActionBroker, 'run'>;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface Actor extends Viewer {
  readonly client: ClientRow;
  readonly phone: boolean;
}

const OK: BrushActionResult = { ok: true, detail: 'Done.' };

type Change = BrushSettingsChange;

async function save(deps: ActDeps, device: DeviceRow, settings: BrushSettings): Promise<void> {
  const state = deps.fleet.of(device);
  const { entry } = state;
  state.useEntry(
    await deps.store.host.write('localConfig', {
      externalId: entry.externalId,
      config: state.runtime.definition.savedConfig(entry, settings),
    }),
  );
}

function keep<T>(change: T | undefined, before: T): T {
  if (change === undefined) {
    return before;
  }
  return change;
}

function mergedAlerts(
  before: BrushSettings['alerts'],
  change: Change['alerts'],
): BrushSettings['alerts'] {
  return {
    headWarnPercent: change?.headWarnPercent ?? before.headWarnPercent,
    headDuePercent: change?.headDuePercent ?? before.headDuePercent,
    batteryLowPercent: change?.batteryLowPercent ?? before.batteryLowPercent,
    counterfeitWarning: change?.counterfeitWarning ?? before.counterfeitWarning,
  };
}

function merged(before: BrushSettings, change: Change, definition: BrushBrand): BrushSettings {
  return definition.mergeSettings(
    {
      ...before,
      policy: keep(change.policy, before.policy),
      personId: keep(change.personId, before.personId),
      consent: keep(change.consent, before.consent),
      alerts: mergedAlerts(before.alerts, change.alerts),
    },
    before,
    change,
  );
}

async function configure(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  change: Change,
): Promise<BrushActionResult> {
  ownerOnly(actor, 'change the toothbrush settings');
  if (change.personId !== undefined && change.personId !== null) {
    await deps.store.host.call('profiles', 'byId', change.personId);
  }
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  const after = merged(before, change, deps.fleet.of(device).runtime.definition);
  await save(deps, device, after);
  if (after.model !== before.model) {
    deps.fleet.refresh(device);
    await deps.local.observe(device.external_id, {});
  }
  deps.log.info('toothbrush.settings_changed', { device: device.id, by: actor.clientId });
  return OK;
}

async function setGoal(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  request: Extract<BrushAction, { action: 'set_goal' }>,
): Promise<BrushActionResult> {
  const personId = request.personId ?? actor.profileId;
  if (personId !== actor.profileId) {
    ownerOnly(actor, 'set another person’s brushing goal');
  }
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  const current = before.goals[personId] ?? BRUSHING_GOAL.parse({});
  await save(deps, device, {
    ...before,
    goals: { ...before.goals, [personId]: BRUSHING_GOAL.parse({ ...current, ...request.goal }) },
  });
  return OK;
}

function assertSessionOwned(actor: Actor, personId: string | null): void {
  if (!ownsSessions(actor, personId)) {
    throw new ApiError('forbidden', 'This session belongs to another person.');
  }
}

async function assignSession(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  request: Extract<BrushAction, { action: 'assign_session' }>,
): Promise<BrushActionResult> {
  const session = await deps.store.host.call('brushingSessions', 'byId', request.sessionId);
  assertSessionOwned(actor, session.personId);
  if (request.personId !== null) {
    await deps.store.host.call('profiles', 'byId', request.personId);
  }
  if (actor.role !== 'owner' && request.personId !== null && request.personId !== actor.profileId) {
    throw new ApiError('forbidden', 'Only the owner assigns a session to another person.');
  }
  await deps.store.host.call('brushingSessions', 'reassign', session.id, request.personId);
  deps.fleet.of(device).sessionsChanged();
  return OK;
}

async function forgetSession(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  request: Extract<BrushAction, { action: 'forget_session' }>,
): Promise<BrushActionResult> {
  const session = await deps.store.host.call('brushingSessions', 'byId', request.sessionId);
  assertSessionOwned(actor, session.personId);
  await deps.store.host.call('brushingSessions', 'remove', session.id);
  deps.fleet.of(device).forgot(session.handleSessionId);
  return OK;
}

function mayChangePerson(actor: Actor, current: string | null, next: string | null): boolean {
  const claims = next === actor.profileId && (current === null || current === actor.profileId);
  const releases = next === null && current === actor.profileId;
  return claims || releases;
}

async function setPerson(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  personId: string | null,
): Promise<BrushActionResult> {
  if (personId !== null) {
    await deps.store.host.call('profiles', 'byId', personId);
  }
  const before = entrySettingsOf(deps.fleet.of(device).entry);
  if (actor.role !== 'owner' && !mayChangePerson(actor, before.personId, personId)) {
    throw new ApiError('forbidden', 'Only the owner says who uses this brush.');
  }
  await save(deps, device, { ...before, personId });
  return OK;
}

async function takeOver(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
): Promise<BrushActionResult> {
  if (!actor.phone) {
    throw new ApiError(
      'forbidden',
      'Only a phone next to the toothbrush can take over the Bluetooth link. Open the toothbrush settings on that phone.',
    );
  }
  const bridge = await deps.bridges.takeOver(device, actor.client);
  return { ok: true, detail: `${bridge.clientName} now holds the Bluetooth link.` };
}

type BrandOnlyAction = Extract<
  BrushAction,
  { action: 'set_mode_order' | 'reset_head_reminder' | 'snooze_head_reminder' | 'probe' }
>;

const BRAND_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  'set_mode_order',
  'reset_head_reminder',
  'snooze_head_reminder',
  'probe',
]);

function isBrandOnly(action: BrushAction): action is BrandOnlyAction {
  return BRAND_ONLY_ACTIONS.has(action.action);
}

export async function actBrush(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  action: BrushAction,
): Promise<BrushActionResult> {
  if (isBrandOnly(action)) {
    return deps.fleet.of(device).runtime.definition.act(action, { deps, device, actor });
  }
  switch (action.action) {
    case 'assign_session':
      return assignSession(deps, device, actor, action);
    case 'set_person':
      return setPerson(deps, device, actor, action.personId);
    case 'set_goal':
      return setGoal(deps, device, actor, action);
    case 'configure':
      return configure(deps, device, actor, action.settings);
    case 'take_over':
      return takeOver(deps, device, actor);
    case 'forget_session':
      return forgetSession(deps, device, actor, action);
    case 'raw_log':
      ownerOnly(actor, 'turn the raw frame log on or off');
      deps.fleet.of(device).setRawLog(action.enabled);
      return OK;
  }
}
