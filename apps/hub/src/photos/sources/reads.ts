import { extname } from 'node:path';
import { ApiError, RECORDING_ROW, deviceInScope } from '@smarteverything/domain';
import { z } from 'zod';
import { DRIVE_PAGE_SIZE } from '../../drive/page-size';
import { sharedDrive } from '../../drive/spaces';
import { storeUnit } from '../../store/host/unit';
import { inList } from '../../store/sql';
import type { Store } from '../../store/store';
import { keptHashes, keptNames } from './kept';
import {
  decodeCursor,
  encodeCursor,
  sourceNarrowing,
  type SourcePage,
  type SourceQuery,
  type SourceViewer,
} from './shapes';

export const SAVED = 'Saved';

export const SAVED_CAMERAS = 'Cameras';

export const SAVED_PREFIX = `${SAVED}/${SAVED_CAMERAS}/`;

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

export type Recording = z.output<typeof RECORDING>;

const SAVED_NAME = `replace(replace(substr(r.started_at, 1, 19), 'T', ' '), ':', '.') || ' ' || r.id
  || case r.kind when 'snapshot' then '.jpg' else '.mp4' end`;

const CAMERA_COLUMNS = { name: SAVED_NAME, chipName: 'd.name', at: 'r.started_at' };

const CAMERA_CHIP_ROW = z.strictObject({ id: z.string(), total: z.int().nonnegative() });

const IMAGE_ROW = z.strictObject({
  id: z.uuid(),
  chat_id: z.string(),
  name: z.string(),
  mime: z.string(),
  bytes: z.int().nonnegative(),
  sha256: z.string(),
  storage_path: z.string(),
  created_at: z.iso.datetime({ offset: true }),
});

export type Image = z.output<typeof IMAGE_ROW>;

const IMAGE_CHIP_ROW = z.strictObject({
  id: z.string(),
  name: z.string(),
  total: z.int().nonnegative(),
});

const FROM = `from image_artifacts a
  join image_operations o on o.id = a.operation_id and o.state = 'completed'
  join assistant_attachments f on f.id = a.attachment_id
  join ai_chats c on c.id = o.chat_id
  where f.profile_id = $profileId and f.mime like 'image/%'`;

const IMAGE_COLUMNS = {
  name: 'f.name',
  chipName: `coalesce(nullif(trim(c.title), ''), 'Untitled chat')`,
  at: 'f.created_at',
};

export function savedName(recording: Pick<Recording, 'id' | 'kind' | 'started_at'>): string {
  const stamp = recording.started_at.slice(0, 19).replace('T', ' ').replaceAll(':', '.');
  return `${stamp} ${recording.id}${EXTENSIONS[recording.kind]}`;
}

export function keptFileName(image: Pick<Image, 'id' | 'name'>): string {
  const extension = extname(image.name);
  const stem = image.name.slice(0, image.name.length - extension.length);
  return `${stem} ${image.id.slice(0, 8)}${extension}`;
}

export interface CameraKeepPlan {
  readonly recordings: readonly (Recording & { readonly cameraName: string })[];
}

class CameraReads {
  constructor(
    private readonly store: Store,
    private readonly permitted: readonly string[],
  ) {}

  page(viewer: SourceViewer, query: SourceQuery): SourcePage {
    const cameras = this.visible(viewer);
    if (query.chipId !== undefined && !cameras.has(query.chipId)) {
      throw new ApiError('not_found', 'This camera is not one you can see.');
    }
    const ids = query.chipId === undefined ? [...cameras.keys()] : [query.chipId];
    const rows = this.rows(ids, query, decodeCursor(query.cursor));
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    const kept = this.keptAmong(shown.map(savedName));
    return {
      chips: this.chips(cameras, query),
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

  keepPlan(viewer: SourceViewer, itemIds: readonly string[]): CameraKeepPlan {
    const cameras = this.visible(viewer);
    return {
      recordings: this.recordings(itemIds).map((recording) => {
        const cameraName = cameras.get(recording.device_id);
        if (cameraName === undefined) {
          throw new ApiError('not_found', 'This recording is not one you can see.');
        }
        return { ...recording, cameraName };
      }),
    };
  }

  keptAmong(names: readonly string[]): ReadonlySet<string> {
    return keptNames(this.store.context.sql, sharedDrive(this.store).id, SAVED_PREFIX, names);
  }

  private visible(viewer: SourceViewer): ReadonlyMap<string, string> {
    const { store } = this;
    const permitted = new Set(this.permitted);
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

  private chips(cameras: ReadonlyMap<string, string>, query: SourceQuery): SourcePage['chips'] {
    const filter = inList('r.device_id', 'devices', [...cameras.keys()]);
    const narrowing = sourceNarrowing(query, CAMERA_COLUMNS);
    const counts = new Map(
      this.store.context.sql
        .all(
          CAMERA_CHIP_ROW,
          `select r.device_id as id, count(*) as total
             from recordings r join devices d on d.id = r.device_id
            where ${filter.text}${narrowing.text} group by r.device_id`,
          { ...filter.parameters, ...narrowing.parameters },
        )
        .map((row) => [row.id, row.total] as const),
    );
    return [...cameras]
      .map(([id, name]) => ({ id, name, count: counts.get(id) ?? 0 }))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
  }

  private rows(
    deviceIds: readonly string[],
    query: SourceQuery,
    after: ReturnType<typeof decodeCursor>,
  ): Recording[] {
    const filter = inList('r.device_id', 'devices', deviceIds);
    const narrowing = sourceNarrowing(query, CAMERA_COLUMNS);
    return this.store.context.sql.all(
      RECORDING,
      `select r.id, r.device_id, r.kind, r.storage_path, r.started_at, r.bytes, r.duration_ms
         from recordings r join devices d on d.id = r.device_id
        where ${filter.text}${narrowing.text}
          and ($afterAt is null or r.started_at < $afterAt
            or (r.started_at = $afterAt and r.id < $afterId))
        order by r.started_at desc, r.id desc limit $limit`,
      {
        ...filter.parameters,
        ...narrowing.parameters,
        afterAt: after?.at ?? null,
        afterId: after?.id ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
  }

  private recordings(ids: readonly string[]): Recording[] {
    const filter = inList('id', 'ids', ids);
    const rows = this.store.context.sql.all(
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
}

class AiImageReads {
  constructor(private readonly store: Store) {}

  page(viewer: SourceViewer, query: SourceQuery): SourcePage {
    const after = decodeCursor(query.cursor);
    const narrowing = sourceNarrowing(query, IMAGE_COLUMNS);
    const filter = `${query.chipId === undefined ? '' : ' and o.chat_id = $chatId'}${narrowing.text}`;
    const rows = this.store.context.sql.all(
      IMAGE_ROW,
      `select f.id, o.chat_id, f.name, f.mime, f.bytes, f.sha256, f.storage_path, f.created_at ${FROM}${filter}
          and ($afterAt is null or f.created_at < $afterAt or (f.created_at = $afterAt and f.id < $afterId))
        order by f.created_at desc, f.id desc limit $limit`,
      {
        profileId: viewer.profileId,
        ...narrowing.parameters,
        ...(query.chipId === undefined ? {} : { chatId: query.chipId }),
        afterAt: after?.at ?? null,
        afterId: after?.id ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    const kept = keptHashes(
      this.store.context.sql,
      viewer.profileId,
      shown.map((row) => row.sha256),
    );
    return {
      chips: this.chips(viewer.profileId, query),
      items: shown.map((row) => ({
        itemId: row.id,
        chipId: row.chat_id,
        madeAt: row.created_at,
        kept: kept.has(row.sha256),
        name: row.name,
        mime: row.mime,
        bytes: row.bytes,
        durationMs: null,
      })),
      next:
        rows.length > DRIVE_PAGE_SIZE && last !== undefined
          ? encodeCursor({ at: last.created_at, id: last.id })
          : null,
    };
  }

  private chips(profileId: string, query: SourceQuery): SourcePage['chips'] {
    const narrowing = sourceNarrowing(query, IMAGE_COLUMNS);
    return this.store.context.sql
      .all(
        IMAGE_CHIP_ROW,
        `select o.chat_id as id, coalesce(nullif(trim(c.title), ''), 'Untitled chat') as name,
                count(*) as total ${FROM}${narrowing.text}
          group by o.chat_id order by max(f.created_at) desc, o.chat_id`,
        { profileId, ...narrowing.parameters },
      )
      .map((row) => ({ id: row.id, name: row.name, count: row.total }));
  }

  images(profileId: string, ids: readonly string[]): Image[] {
    const filter = inList('f.id', 'ids', ids);
    const rows = this.store.context.sql.all(
      IMAGE_ROW,
      `select f.id, o.chat_id, f.name, f.mime, f.bytes, f.sha256, f.storage_path, f.created_at ${FROM}
          and ${filter.text} order by f.created_at, f.id`,
      { ...filter.parameters, profileId },
    );
    if (rows.length !== new Set(ids).size) {
      throw new ApiError('not_found', 'An image is not one of yours or is no longer there.');
    }
    return rows;
  }
}

export interface Viewed {
  readonly viewer: SourceViewer;
  readonly permitted: readonly string[];
}

export const PHOTO_CAMERA_PAGE_UNIT = storeUnit(
  (store, input: Viewed & { readonly query: SourceQuery }) =>
    new CameraReads(store, input.permitted).page(input.viewer, input.query),
);

export const PHOTO_CAMERA_KEEP_PLAN_UNIT = storeUnit(
  (store, input: Viewed & { readonly itemIds: readonly string[] }) =>
    new CameraReads(store, input.permitted).keepPlan(input.viewer, input.itemIds),
);

export const PHOTO_CAMERA_KEPT_UNIT = storeUnit(
  (store, input: { readonly names: readonly string[] }) => [
    ...new CameraReads(store, []).keptAmong(input.names),
  ],
);

export const PHOTO_AI_IMAGE_PAGE_UNIT = storeUnit(
  (store, input: { readonly viewer: SourceViewer; readonly query: SourceQuery }) =>
    new AiImageReads(store).page(input.viewer, input.query),
);

export const PHOTO_AI_IMAGES_UNIT = storeUnit(
  (store, input: { readonly profileId: string; readonly itemIds: readonly string[] }) =>
    new AiImageReads(store).images(input.profileId, input.itemIds),
);

export const PHOTO_AI_IMAGE_KEPT_UNIT = storeUnit(
  (store, input: { readonly profileId: string; readonly sha256: string }) =>
    keptHashes(store.context.sql, input.profileId, [input.sha256]).size > 0,
);
