import {
  ApiError,
  WATCH_AUTH_KEY,
  type ClientRow,
  type WatchBridge,
  type DeviceRow,
  WATCH_CONFIG,
  WATCH_WORKOUT,
  type WatchConfigReport,
  type WatchWorkoutReport,
  type WatchDayRow,
  type PhoneWatch,
  type WatchCandidate,
  type WatchCandidates,
  type WatchState,
  watchWorkoutStatusOf,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { SecretStore } from '../secrets/store';
import type { StateWriter } from '../state/state-writer';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { Store } from '../store/store';
import type { LocalDevices } from './local-devices';
import type { Wearable } from '@smarteverything/xiaomi';
import type { WearableSource } from './setup-types';
import { cloudRowOf, externalIdOfWatch } from './watch-setup';
import type { WatchActionTarget } from './watch-actions';
import type { UploadResult, WatchUpload } from './watch-uploads';
import { WatchBridges } from './watch-bridge';

export interface LocalWatchesOptions {
  readonly store: Store;
  readonly secrets: Pick<SecretStore, 'deviceKey'>;
  readonly local: Pick<LocalDevices, 'observe' | 'deviceOf'>;
  readonly wearables: WearableSource;
  readonly state: Pick<StateWriter, 'push'>;
  readonly now: () => Date;
  readonly log: Logger;
}

function profileOf(entry: LocalDeviceEntry): string | null {
  const profileId = entry.config['profileId'];
  return typeof profileId === 'string' ? profileId : null;
}

export class LocalWatches {
  private readonly bridges: WatchBridges;

  constructor(private readonly options: LocalWatchesOptions) {
    this.bridges = new WatchBridges({
      observe: (externalId, values): Promise<void> => options.local.observe(externalId, values),
      now: options.now,
      log: options.log,
    });
  }

  async takeOverBridge(
    device: DeviceRow,
    profileId: string,
    client: ClientRow,
  ): Promise<WatchBridge> {
    await this.ownedBy(device, profileId);
    return await this.bridges.takeOver(device, client);
  }

  async candidates(): Promise<WatchCandidates> {
    const list = await this.options.wearables();
    const entries = await this.entries();
    const watches = await Promise.all(
      list.wearables.map((wearable) => this.candidateOf(entries, wearable)),
    );
    return { watches, skipped: list.skipped.length };
  }

  private async candidateOf(
    entries: readonly LocalDeviceEntry[],
    wearable: Wearable,
  ): Promise<WatchCandidate> {
    const added = entries.find((entry) => entry.externalId === externalIdOfWatch(wearable.mac));
    return {
      family: 'xiaomi',
      name: wearable.name,
      model: wearable.model,
      address: wearable.mac,
      deviceId:
        added === undefined ? null : ((await this.options.local.deviceOf(added))?.id ?? null),
      replaces: (await cloudRowOf(this.options.store, wearable))?.id ?? null,
    };
  }

  async mine(profileId: string, client: ClientRow): Promise<{ watches: PhoneWatch[] }> {
    const watches: PhoneWatch[] = [];
    const entries = await this.entries();
    for (const entry of entries.filter((candidate) => profileOf(candidate) === profileId)) {
      const device = await this.options.local.deviceOf(entry);
      if (device === undefined || (await this.bridges.acquire(device, client)) === null) {
        watches.push(await this.phoneWatchOf(entry));
      }
    }
    this.options.log.info('watch.keys_served', {
      requestedBy: client.id,
      profileId,
      watches: watches.length,
    });
    return { watches };
  }

  async report(
    device: DeviceRow,
    profileId: string,
    state: WatchState,
    client: ClientRow,
  ): Promise<void> {
    const entry = await this.ownedBy(device, profileId);
    await this.bridges.require(device, client);
    const { at, config, workout, ...rest } = state;
    if (state.phase === 'connected') {
      await this.bridges.pair(device, client);
    }
    await this.options.local.observe(entry.externalId, {
      ...rest,
      ...(config === undefined ? {} : { config }),
      ...(workout === undefined ? {} : { workout }),
      reportedAt: at,
      reportedBy: client.id,
    });
    if (workout !== undefined) {
      this.options.state.push('local', {
        externalId: entry.externalId,
        capability: 'watch_workout',
        value: watchWorkoutStatusOf(workout),
        observedAt: at,
      });
    }
    const payload = {
      device: device.id,
      by: client.id,
      phase: state.phase,
      battery: state.battery,
      error: state.error,
    };
    if (state.phase === 'failed') {
      this.options.log.warn('watch.state_reported', payload);
    } else {
      this.options.log.info('watch.state_reported', payload);
    }
  }

  async save(
    device: DeviceRow,
    profileId: string,
    upload: WatchUpload,
    client: ClientRow,
  ): Promise<UploadResult> {
    await this.ownedBy(device, profileId);
    await this.bridges.require(device, client);
    const result = await this.options.store.host.write('watchUpload', {
      owner: { profileId, deviceId: device.id },
      upload,
    });
    this.options.log.info('watch.records_saved', {
      device: device.id,
      by: client.id,
      records: result.saved,
      types: [...new Set(upload.records.map((record) => record.type))].join(', '),
      samples: result.samples,
      routes: upload.routes.length,
      unmatchedRoutes: result.unmatchedRoutes.length,
    });
    return result;
  }

  bridgeClientOf(device: DeviceRow): string | null {
    return this.bridges.holderOf(device)?.clientId ?? null;
  }

  async target(device: DeviceRow): Promise<WatchActionTarget> {
    const entry = await this.watchOf(device);
    const profileId = profileOf(entry);
    if (profileId === null) {
      throw new ApiError('conflict', `${device.name} is not assigned to anyone yet.`);
    }
    return {
      deviceId: device.id,
      profileId,
      name: device.display_name ?? device.name,
      bridgeClientId: this.bridgeClientOf(device),
    };
  }

  async config(device: DeviceRow): Promise<WatchConfigReport> {
    const target = await this.target(device);
    const parsed = WATCH_CONFIG.safeParse(device.details['config']);
    if (!parsed.success) {
      throw new ApiError(
        'conflict',
        `${target.name}’s settings have not been read yet; they arrive once the watch connects to its person’s phone.`,
      );
    }
    const { phase, battery, reportedAt } = device.details;
    return {
      deviceId: device.id,
      name: target.name,
      phase: typeof phase === 'string' ? phase : null,
      battery: typeof battery === 'number' ? battery : null,
      reportedAt: typeof reportedAt === 'string' ? reportedAt : null,
      config: parsed.data,
    };
  }

  async workout(device: DeviceRow): Promise<WatchWorkoutReport> {
    const target = await this.target(device);
    const config = WATCH_CONFIG.safeParse(device.details['config']);
    const raw = device.details['workout'];
    const workout = raw === undefined || raw === null ? null : WATCH_WORKOUT.parse(raw);
    return {
      deviceId: device.id,
      name: target.name,
      sports: config.success ? config.data.sports : [],
      workout,
    };
  }

  async days(profileId: string, from: string, to: string): Promise<{ days: WatchDayRow[] }> {
    return { days: await this.options.store.host.call('watchDays', 'window', profileId, from, to) };
  }

  private async ownedBy(device: DeviceRow, profileId: string): Promise<LocalDeviceEntry> {
    const entry = await this.watchOf(device);
    if (profileOf(entry) !== profileId) {
      throw new ApiError('forbidden', `${device.name} belongs to another person’s phone.`);
    }
    return entry;
  }

  private async entries(): Promise<LocalDeviceEntry[]> {
    return (await this.options.store.host.call('localDevices', 'list')).filter(
      (entry) => entry.driver === 'xiaomi_watch',
    );
  }

  private async watchOf(device: DeviceRow): Promise<LocalDeviceEntry> {
    const entry =
      device.provider === 'local'
        ? (await this.entries()).find((candidate) => candidate.externalId === device.external_id)
        : undefined;
    if (entry === undefined) {
      throw new ApiError('invalid_request', `${device.name} is not a watch this hub knows.`);
    }
    return entry;
  }

  private async phoneWatchOf(entry: LocalDeviceEntry): Promise<PhoneWatch> {
    const device = await this.options.local.deviceOf(entry);
    const key = WATCH_AUTH_KEY.safeParse(this.options.secrets.deviceKey(entry.externalId));
    if (device === undefined || !key.success) {
      throw new ApiError(
        'conflict',
        `The watch ${entry.name} has no saved key on this hub; remove it and add it again.`,
      );
    }
    const model = entry.config['model'];
    return {
      deviceId: device.id,
      family: 'xiaomi',
      name: device.display_name ?? device.name,
      model: typeof model === 'string' ? model : null,
      address: entry.address,
      authKey: key.data,
    };
  }
}
