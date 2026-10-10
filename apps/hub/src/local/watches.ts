import {
  ApiError,
  WATCH_AUTH_KEY,
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
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { SecretStore } from '../secrets/store';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { Store } from '../store/store';
import type { LocalDevices } from './local-devices';
import type { Wearable } from '@smarteverything/xiaomi';
import type { WearableSource } from './setup-types';
import { cloudRowOf, externalIdOfWatch } from './watch-setup';
import type { WatchActionTarget } from './watch-actions';
import { saveWatchUpload, type UploadResult, type WatchUpload } from './watch-uploads';

export interface LocalWatchesOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly local: LocalDevices;
  readonly wearables: WearableSource;
  readonly log: Logger;
}

function profileOf(entry: LocalDeviceEntry): string | null {
  const profileId = entry.config['profileId'];
  return typeof profileId === 'string' ? profileId : null;
}

export class LocalWatches {
  constructor(private readonly options: LocalWatchesOptions) {}

  async candidates(): Promise<WatchCandidates> {
    const list = await this.options.wearables();
    const watches = list.wearables.map((wearable) => this.candidateOf(wearable));
    return { watches, skipped: list.skipped.length };
  }

  private candidateOf(wearable: Wearable): WatchCandidate {
    const added = this.entries().find(
      (entry) => entry.externalId === externalIdOfWatch(wearable.mac),
    );
    return {
      family: 'xiaomi',
      name: wearable.name,
      model: wearable.model,
      address: wearable.mac,
      deviceId: added === undefined ? null : (this.options.local.deviceOf(added)?.id ?? null),
      replaces: cloudRowOf(this.options.store, wearable)?.id ?? null,
    };
  }

  mine(profileId: string, requestedBy: string): { watches: PhoneWatch[] } {
    const watches = this.entries()
      .filter((entry) => profileOf(entry) === profileId)
      .map((entry) => this.phoneWatchOf(entry));
    this.options.log.info('watch.keys_served', { requestedBy, profileId, watches: watches.length });
    return { watches };
  }

  async report(device: DeviceRow, profileId: string, state: WatchState, by: string): Promise<void> {
    const entry = this.watchOf(device);
    if (profileOf(entry) !== profileId) {
      throw new ApiError('forbidden', `${device.name} belongs to another person’s phone.`);
    }
    const { at, config, workout, ...rest } = state;
    await this.options.local.observe(entry.externalId, {
      ...rest,
      ...(config === undefined ? {} : { config }),
      ...(workout === undefined ? {} : { workout }),
      reportedAt: at,
      reportedBy: by,
    });
    const payload = {
      device: device.id,
      by,
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

  save(device: DeviceRow, profileId: string, upload: WatchUpload, by: string): UploadResult {
    const entry = this.watchOf(device);
    if (profileOf(entry) !== profileId) {
      throw new ApiError('forbidden', `${device.name} belongs to another person’s phone.`);
    }
    const result = saveWatchUpload(this.options.store, { profileId, deviceId: device.id }, upload);
    this.options.log.info('watch.records_saved', {
      device: device.id,
      by,
      records: result.saved,
      types: [...new Set(upload.records.map((record) => record.type))].join(', '),
      samples: result.samples,
      routes: upload.routes.length,
      unmatchedRoutes: result.unmatchedRoutes.length,
    });
    return result;
  }

  target(device: DeviceRow): WatchActionTarget {
    const entry = this.watchOf(device);
    const profileId = profileOf(entry);
    if (profileId === null) {
      throw new ApiError('conflict', `${device.name} is not assigned to anyone yet.`);
    }
    return { deviceId: device.id, profileId, name: device.display_name ?? device.name };
  }

  config(device: DeviceRow): WatchConfigReport {
    const target = this.target(device);
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

  workout(device: DeviceRow): WatchWorkoutReport {
    const target = this.target(device);
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

  days(profileId: string, from: string, to: string): { days: WatchDayRow[] } {
    return { days: this.options.store.watchDays.window(profileId, from, to) };
  }

  private entries(): LocalDeviceEntry[] {
    return this.options.store.localDevices
      .list()
      .filter((entry) => entry.driver === 'xiaomi_watch');
  }

  private watchOf(device: DeviceRow): LocalDeviceEntry {
    const entry =
      device.provider === 'local'
        ? this.entries().find((candidate) => candidate.externalId === device.external_id)
        : undefined;
    if (entry === undefined) {
      throw new ApiError('invalid_request', `${device.name} is not a watch this hub knows.`);
    }
    return entry;
  }

  private phoneWatchOf(entry: LocalDeviceEntry): PhoneWatch {
    const device = this.options.local.deviceOf(entry);
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
