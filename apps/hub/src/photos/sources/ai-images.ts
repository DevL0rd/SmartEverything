import { extname } from 'node:path';
import { ApiError, type DriveRoot, type PhotoSource } from '@smarteverything/domain';
import { z } from 'zod';
import { physicalRoot } from '../../drive/intents';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import { inList } from '../../store/sql';
import { Keeper, safeName } from './keeper';
import { keptHashes } from './kept';
import {
  decodeCursor,
  encodeCursor,
  type SourcePage,
  type SourceQuery,
  type SourceService,
  type SourceViewer,
  type SourcesEnv,
} from './shapes';

export const MADE_WITH_AI = 'Made with AI';

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

type Image = z.output<typeof IMAGE_ROW>;

const CHIP_ROW = z.strictObject({
  id: z.string(),
  name: z.string(),
  total: z.int().nonnegative(),
});

const FROM = `from image_artifacts a
  join image_operations o on o.id = a.operation_id and o.state = 'completed'
  join assistant_attachments f on f.id = a.attachment_id
  join ai_chats c on c.id = o.chat_id
  where f.profile_id = $profileId and f.mime like 'image/%'`;

export interface AiImageSourceOptions {
  readonly env: SourcesEnv;
  readonly attachmentPath: (storagePath: string) => string;
}

export function keptFileName(image: Pick<Image, 'id' | 'name'>): string {
  const extension = extname(image.name);
  const stem = image.name.slice(0, image.name.length - extension.length);
  return `${stem} ${image.id.slice(0, 8)}${extension}`;
}

export class AiImageSource implements SourceService {
  readonly source: PhotoSource = 'ai';
  private readonly keeper: Keeper;

  constructor(private readonly options: AiImageSourceOptions) {
    this.keeper = new Keeper(options.env);
  }

  page(viewer: SourceViewer, query: SourceQuery): SourcePage {
    const after = decodeCursor(query.cursor);
    const filter = query.chipId === undefined ? '' : ' and o.chat_id = $chatId';
    const rows = this.options.env.sql.all(
      IMAGE_ROW,
      `select f.id, o.chat_id, f.name, f.mime, f.bytes, f.sha256, f.storage_path, f.created_at ${FROM}${filter}
          and ($afterAt is null or f.created_at < $afterAt or (f.created_at = $afterAt and f.id < $afterId))
        order by f.created_at desc, f.id desc limit $limit`,
      {
        profileId: viewer.profileId,
        ...(query.chipId === undefined ? {} : { chatId: query.chipId }),
        afterAt: after?.at ?? null,
        afterId: after?.id ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    const kept = keptHashes(
      this.options.env.sql,
      viewer.profileId,
      shown.map((row) => row.sha256),
    );
    return {
      chips: this.chips(viewer.profileId),
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

  async keep(viewer: SourceViewer, itemIds: readonly string[]): Promise<number> {
    const images = this.images(viewer.profileId, itemIds);
    return await this.keeper.serialized(async () => {
      const root = this.personRoot(viewer.profileId);
      let copied = 0;
      for (const image of images) {
        if (keptHashes(this.options.env.sql, viewer.profileId, [image.sha256]).size > 0) continue;
        await this.keeper.copy({
          root: physicalRoot(root),
          folders: [MADE_WITH_AI],
          name: safeName(keptFileName(image), image.id),
          source: this.options.attachmentPath(image.storage_path),
          actor: { actorProfileId: viewer.profileId, via: 'app', deviceId: null },
        });
        copied += 1;
      }
      return copied;
    });
  }

  private chips(profileId: string): SourcePage['chips'] {
    return this.options.env.sql
      .all(
        CHIP_ROW,
        `select o.chat_id as id, coalesce(nullif(trim(c.title), ''), 'Untitled chat') as name,
                count(*) as total ${FROM}
          group by o.chat_id order by max(f.created_at) desc, o.chat_id`,
        { profileId },
      )
      .map((row) => ({ id: row.id, name: row.name, count: row.total }));
  }

  private images(profileId: string, ids: readonly string[]): Image[] {
    const filter = inList('f.id', 'ids', ids);
    const rows = this.options.env.sql.all(
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

  private personRoot(profileId: string): DriveRoot {
    const root = this.options.env.store.driveRoots
      .list()
      .find(
        (candidate) =>
          candidate.kind === 'managed' &&
          candidate.scope === 'person' &&
          candidate.ownerProfileId === profileId,
      );
    if (root === undefined) {
      throw new ApiError('not_found', 'This person has no library folder to keep images in.');
    }
    return root;
  }
}
