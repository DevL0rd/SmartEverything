import {
  ApiError,
  RECORDING_ROW,
  deviceInScope,
  type DriveRoot,
  type PhotoSource,
} from '@smarteverything/domain';
import { z } from 'zod';
import { physicalRoot } from '../../drive/intents';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import { inList } from '../../store/sql';
import { Keeper, safeName } from './keeper';
import { keptNames } from './kept';
import {
  decodeCursor,
  encodeCursor,
  type SourcePage,
  type SourceQuery,
  type SourceService,
  type SourceViewer,
  type SourcesEnv,
} from './shapes';

export const SAVED = 'Saved';

export const SAVED_CAMERAS = 'Cameras';

const SAVED_PREFIX = `${SAVED}/${SAVED_CAMERAS}/`;

const EXTENSIONS: Readonly<Record<z.output<typeof RECORDING_ROW>['kind'], string>> = {
  snapshot: '.jpg',
  clip: '.mp4',
};

const MIMES: Readonly<Record<z.output<typeof RECORDING_ROW>['kind'], string>> = {
  snapshot: 'image/jpeg',
  clip: 'video/mp4',
};

const RECORDING = RECORDING_ROW.pick({
  id: true,
  device_id: true,
  kind: true,
  storage_path: true,
  started_at: true,
  bytes: true,
  duration_ms: true,
});

type Recording = z.output<typeof RECORDING>;

const CHIP_ROW = z.strictObject({ id: z.string(), total: z.int().nonnegative() });

export interface CameraSourceOptions {
  readonly env: SourcesEnv;
  readonly recordingPath: (storagePath: string) => string;
  readonly permitted: () => readonly string[];
}

export function savedName(recording: Pick<Recording, 'id' | 'kind' | 'started_at'>): string {
  const stamp = recording.started_at.slice(0, 19).replace('T', ' ').replaceAll(':', '.');
  return `${stamp} ${recording.id}${EXTENSIONS[recording.kind]}`;
}

export class CameraSource implements SourceService {
  readonly source: PhotoSource = 'cameras';
  private readonly keeper: Keeper;

  constructor(private readonly options: CameraSourceOptions) {
    this.keeper = new Keeper(options.env);
  }

  page(viewer: SourceViewer, query: SourceQuery): SourcePage {
    const cameras = this.visible(viewer);
    if (query.chipId !== undefined && !cameras.has(query.chipId)) {
      throw new ApiError('not_found', 'This camera is not one you can see.');
    }
    const ids = query.chipId === undefined ? [...cameras.keys()] : [query.chipId];
    const rows = this.rows(ids, decodeCursor(query.cursor));
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    const kept = this.keptAmong(shown);
    return {
      chips: this.chips(cameras),
      items: shown.map((row) => ({
        itemId: row.id,
        chipId: row.device_id,
        madeAt: row.started_at,
        kept: kept.has(savedName(row)),
        name: savedName(row),
        mime: MIMES[row.kind],
        bytes: row.bytes,
        durationMs: row.duration_ms,
      })),
      next:
        rows.length > DRIVE_PAGE_SIZE && last !== undefined
          ? encodeCursor({ at: last.started_at, id: last.id })
          : null,
    };
  }

  async keep(viewer: SourceViewer, itemIds: readonly string[]): Promise<number> {
    const cameras = this.visible(viewer);
    const recordings = this.recordings(itemIds);
    for (const recording of recordings) {
      if (!cameras.has(recording.device_id)) {
        throw new ApiError('not_found', 'This recording is not one you can see.');
      }
    }
    return await this.keeper.serialized(async () => {
      const root = this.savedRoot();
      let copied = 0;
      for (const recording of recordings) {
        if (this.keptAmong([recording]).has(savedName(recording))) continue;
        await this.keeper.copy({
          root: physicalRoot(root),
          folders: [
            SAVED,
            SAVED_CAMERAS,
            safeName(cameras.get(recording.device_id) ?? '', recording.device_id),
          ],
          name: savedName(recording),
          source: this.options.recordingPath(recording.storage_path),
          actor: { actorProfileId: viewer.profileId, via: 'app', deviceId: null },
        });
        copied += 1;
      }
      return copied;
    });
  }

  private visible(viewer: SourceViewer): ReadonlyMap<string, string> {
    const { store } = this.options.env;
    const permitted = new Set(this.options.permitted());
    const names = new Map<string, string>();
    for (const camera of store.cameras.list()) {
      const device = store.devices.find(camera.device_id);
      if (
        device !== undefined &&
        permitted.has(device.id) &&
        (viewer.devices === null || deviceInScope(viewer.devices, device))
      ) {
        names.set(device.id, device.name);
      }
    }
    return names;
  }

  private chips(cameras: ReadonlyMap<string, string>): SourcePage['chips'] {
    const filter = inList('device_id', 'devices', [...cameras.keys()]);
    const counts = new Map(
      this.options.env.sql
        .all(
          CHIP_ROW,
          `select device_id as id, count(*) as total from recordings where ${filter.text} group by device_id`,
          filter.parameters,
        )
        .map((row) => [row.id, row.total] as const),
    );
    return [...cameras]
      .map(([id, name]) => ({ id, name, count: counts.get(id) ?? 0 }))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
  }

  private rows(deviceIds: readonly string[], after: ReturnType<typeof decodeCursor>): Recording[] {
    const filter = inList('device_id', 'devices', deviceIds);
    return this.options.env.sql.all(
      RECORDING,
      `select id, device_id, kind, storage_path, started_at, bytes, duration_ms from recordings
        where ${filter.text}
          and ($afterAt is null or started_at < $afterAt or (started_at = $afterAt and id < $afterId))
        order by started_at desc, id desc limit $limit`,
      {
        ...filter.parameters,
        afterAt: after?.at ?? null,
        afterId: after?.id ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
  }

  private recordings(ids: readonly string[]): Recording[] {
    const filter = inList('id', 'ids', ids);
    const rows = this.options.env.sql.all(
      RECORDING,
      `select id, device_id, kind, storage_path, started_at, bytes, duration_ms from recordings
        where ${filter.text} order by started_at, id`,
      filter.parameters,
    );
    if (rows.length !== new Set(ids).size) {
      throw new ApiError('not_found', 'A recording is no longer there.');
    }
    return rows;
  }

  private keptAmong(recordings: readonly Recording[]): ReadonlySet<string> {
    const root = this.homeRoot();
    return root === undefined
      ? new Set()
      : keptNames(this.options.env.sql, root.id, SAVED_PREFIX, recordings.map(savedName));
  }

  private homeRoot(): DriveRoot | undefined {
    return this.options.env.store.driveRoots
      .list()
      .find((root) => root.kind === 'managed' && root.scope === 'home');
  }

  private savedRoot(): DriveRoot {
    const root = this.homeRoot();
    if (root === undefined) {
      throw new ApiError('not_found', 'The hub has no SmartEverything folder to save into.');
    }
    return root;
  }
}
