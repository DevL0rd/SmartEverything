import { EMPTY_CLASSIFIER, fitCalibration } from '@smarteverything/ble';
import {
  ApiError,
  type BottleAction,
  type BottleActResult,
  type ClientRow,
  type DeviceRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { LocalDevices } from '../local-devices';
import type { WatchBridges } from '../watch-bridge';
import { assertStanding, standingOf, type Viewer } from './access';
import type { BottleActions } from './actions';
import type { HomeClock } from './clock';
import { entryConfigOf, saveConfig, type BottleEntryConfig } from './config';
import type { DrinksDeps } from './drinks';
import { rederive } from './rederive';
import type { ReadingsDeps } from './readings';
import { SNAP } from './snapshots';
import type { StatsCache } from './views-stats';

export interface ActDeps {
  readonly store: Store;
  readonly readings: ReadingsDeps['readings'];
  readonly snapshots: ReadingsDeps['snapshots'];
  readonly drinks: DrinksDeps;
  readonly actions: Pick<BottleActions, 'run'>;
  readonly bridges: Pick<WatchBridges, 'takeOver'>;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly stats: Pick<StatsCache, 'invalidate'>;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface Actor extends Viewer {
  readonly client: ClientRow;
}

interface Target {
  readonly deps: ActDeps;
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly actor: Actor;
}

type ActionName = BottleAction['action'];

type ActionOf<A extends ActionName> = Extract<BottleAction, { action: A }>;

type Handlers = {
  readonly [A in ActionName]: (target: Target, action: ActionOf<A>) => Promise<BottleActResult>;
};

function ok(detail: string): BottleActResult {
  return { ok: true, detail };
}

function readingsDepsOf(deps: ActDeps): ReadingsDeps {
  return { readings: deps.readings, snapshots: deps.snapshots, now: deps.now };
}

function forgetClassifier(target: Target): void {
  const { deps, device } = target;
  deps.snapshots.save(device.id, SNAP.classifier, deps.now().toISOString(), EMPTY_CLASSIFIER);
  deps.stats.invalidate();
}

async function changed(target: Target, patch: Partial<BottleEntryConfig>): Promise<void> {
  const { deps, entry } = target;
  saveConfig(deps.store, entry, { ...entryConfigOf(entry), ...patch });
  deps.stats.invalidate();
  await deps.local.observe(entry.externalId, {});
}

function pushed(
  command: Parameters<BottleActions['run']>[2],
): (target: Target) => Promise<BottleActResult> {
  return ({ deps, device, entry }) => deps.actions.run(device, entry, command);
}

function recomputed(target: Target): BottleActResult {
  const { deps, device, entry } = target;
  const done = rederive({ ...readingsDepsOf(deps), drinks: deps.drinks }, device.id, entry);
  deps.stats.invalidate();
  return ok(
    `Recomputed ${String(done.readings)} readings: ${String(done.added)} drinks added, ${String(done.corrected)} corrected.`,
  );
}

async function bind(target: Target, personId: string | null): Promise<BottleActResult> {
  const { deps, actor } = target;
  if (actor.role !== 'owner' && personId !== null) {
    throw new ApiError('forbidden', 'Only the owner can give a bottle to another person.');
  }
  if (personId !== null) {
    deps.store.profiles.byId(personId);
  }
  await changed(target, {
    binding:
      personId === null
        ? { profileId: null, boundBy: null, boundAt: null, keptAt: null }
        : {
            profileId: personId,
            boundBy: actor.profileId,
            boundAt: deps.now().toISOString(),
            keptAt: null,
          },
  });
  if (personId === null) {
    return ok('The bottle no longer saves drinks. Drinks already in the water log stay.');
  }
  const done = rederive(
    { ...readingsDepsOf(deps), drinks: deps.drinks },
    target.device.id,
    deps.store.localDevices.byExternalId(target.entry.externalId),
  );
  deps.stats.invalidate();
  return ok(`Drinks now go into the water log. ${String(done.added)} past drinks were added.`);
}

async function keep(target: Target): Promise<BottleActResult> {
  const config = entryConfigOf(target.entry);
  if (standingOf(target.actor, config) !== 'bound') {
    throw new ApiError('forbidden', 'Only the person this bottle is bound to can keep it.');
  }
  await changed(target, {
    binding: { ...config.binding, keptAt: target.deps.now().toISOString() },
  });
  return ok('Kept. Its drinks go into your water log.');
}

async function takeOver(target: Target): Promise<BottleActResult> {
  const bridge = await target.deps.bridges.takeOver(target.device, target.actor.client);
  return ok(`${bridge.clientName} now syncs ${target.device.display_name ?? target.device.name}.`);
}

async function wish(
  target: Target,
  key: 'reminder' | 'quiet',
  change: BottleEntryConfig['desired']['reminder'] | BottleEntryConfig['desired']['quiet'],
): Promise<BottleActResult> {
  const { desired } = entryConfigOf(target.entry);
  await changed(target, { desired: { ...desired, [key]: { ...desired[key], ...change } } });
  return ok('Saved. It applies when the bottle next wakes.');
}

async function calibrate(
  target: Target,
  action: ActionOf<'set_calibration'>,
): Promise<BottleActResult> {
  const fit = fitCalibration(action.points);
  await changed(target, {
    calibration: {
      points: action.points,
      curve: fit.curve,
      rmseMl: fit.rmseMl,
      fittedAt: target.deps.now().toISOString(),
    },
  });
  forgetClassifier(target);
  return ok(`Calibration saved. The curve is within ${fit.rmseMl.toFixed(1)} ml of your cup.`);
}

async function filtered(target: Target, action: ActionOf<'set_filter'>): Promise<BottleActResult> {
  const current = entryConfigOf(target.entry).filter;
  const today = target.deps.clock.dayOf(target.deps.now());
  await changed(target, {
    filter: {
      installed: action.installed,
      type: action.type ?? current.type,
      installedOn: action.installed ? (action.installedOn ?? current.installedOn ?? today) : null,
    },
  });
  return ok('Filter saved.');
}

const HANDLERS: Handlers = {
  sync: pushed('sync_now'),
  measure: pushed('measure'),
  read_sensors: pushed('read_sensors'),
  read_orientation: pushed('read_orientation'),
  uv_stop: pushed('uv_stop'),
  take_over: takeOver,
  rederive: (target) => Promise.resolve(recomputed(target)),
  set_reminder: (target, action) => wish(target, 'reminder', action.reminder),
  set_quiet_hours: (target, action) => wish(target, 'quiet', action.quiet),
  set_body: async (target, action) => {
    await changed(target, { body: action.body });
    forgetClassifier(target);
    return ok('Saved. Past drinks keep their size; use rederive to recompute them.');
  },
  set_filter: filtered,
  reset_filter: async (target) => {
    const filter = entryConfigOf(target.entry).filter;
    await changed(target, {
      filter: {
        ...filter,
        installed: true,
        installedOn: target.deps.clock.dayOf(target.deps.now()),
      },
    });
    return ok('Filter counters restarted today.');
  },
  bind_person: (target, action) => bind(target, action.personId),
  keep_binding: keep,
  set_calibration: calibrate,
  clear_calibration: async (target) => {
    await changed(target, { calibration: null });
    forgetClassifier(target);
    return ok('Calibration removed. The standard curve is used again.');
  },
};

function dispatch<A extends ActionName>(
  target: Target,
  action: ActionOf<A>,
): Promise<BottleActResult> {
  const handler: Handlers[A] = HANDLERS[action.action];
  return handler(target, action);
}

export async function actBottle(
  deps: ActDeps,
  device: DeviceRow,
  actor: Actor,
  action: BottleAction,
): Promise<BottleActResult> {
  const entry = deps.store.localDevices.byExternalId(device.external_id);
  if (action.action !== 'uv_stop') {
    assertStanding(actor, entryConfigOf(entry), device.display_name ?? device.name);
  }
  const result = await dispatch({ deps, device, entry, actor }, action);
  return result;
}
