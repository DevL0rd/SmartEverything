import { ApiError, type LibraryFilter, type LibraryScope } from '@smarteverything/domain';
import { albumVisibleTo, type DriveActor } from '../drive/access';
import { driveMatchOf, durationFilter } from '../drive/search';
import { compileSmartRule } from '../drive/smart-sql-compile';
import type { StoreContext } from '../store/context';
import { DriveAlbumsRepository } from '../store/repositories/drive-albums';
import { starredBy } from '../store/repositories/drive-stars';
import type { SqlParameters } from '../store/sql';

export interface Statement {
  readonly text: string;
  readonly parameters: SqlParameters;
}

export const OFFSET_PADDING_MS = 86_400_000;

const OFFSET_MODIFIER = `coalesce(m.tz_offset_min, 0) || ' minutes'`;

export const LOCAL_DAY = `date(i.taken_at, ${OFFSET_MODIFIER})`;

export const LOCAL_MONTH = `strftime('%Y-%m', i.taken_at, ${OFFSET_MODIFIER})`;

export const LOCAL_SECONDS = `unixepoch(i.taken_at, ${OFFSET_MODIFIER})`;

const SCREENSHOT = `i.kind = 'image' and (lower(i.name) like 'screenshot%' or lower(i.rel_path) like '%screenshots/%')`;

export const FILTER_SQL: Readonly<Record<LibraryFilter, string>> = {
  all: '',
  favourites: ` and ${starredBy()}`,
  videos: " and i.kind = 'video'",
  screenshots: ` and ${SCREENSHOT}`,
};

const CAMERA_TEXT = `lower(trim(coalesce(i.camera_make, '') || ' ' || coalesce(i.camera_model, '')))`;

export function dayRange(fromDay: string | null, toDay: string | null): Statement {
  const clauses: string[] = [];
  const parameters: Record<string, string> = {};
  if (fromDay !== null) {
    clauses.push(`i.taken_at >= $windowFrom and ${LOCAL_DAY} >= $fromDay`);
    parameters['windowFrom'] = new Date(Date.parse(fromDay) - OFFSET_PADDING_MS).toISOString();
    parameters['fromDay'] = fromDay;
  }
  if (toDay !== null) {
    clauses.push(`i.taken_at < $windowTo and ${LOCAL_DAY} <= $toDay`);
    parameters['windowTo'] = new Date(Date.parse(toDay) + 2 * OFFSET_PADDING_MS).toISOString();
    parameters['toDay'] = toDay;
  }
  return { text: clauses.map((clause) => ` and ${clause}`).join(''), parameters };
}

function textStatement(text: string): Statement {
  const match = driveMatchOf(text);
  if (match === null) return { text: ' and 0', parameters: {} };
  return {
    text: ' and i.id in (select item_id from drive_items_search where drive_items_search match $match)',
    parameters: { match },
  };
}

function joined(parts: readonly Statement[]): Statement {
  return {
    text: parts.map((part) => part.text).join(''),
    parameters: parts.reduce<SqlParameters>((all, part) => ({ ...all, ...part.parameters }), {}),
  };
}

export class AlbumScopes {
  private readonly albums: DriveAlbumsRepository;

  constructor(
    context: StoreContext,
    private readonly timeZone: () => string,
  ) {
    this.albums = new DriveAlbumsRepository(context);
  }

  statement(actor: DriveActor, albumId: string): Statement {
    const album = this.albums.byId(albumId);
    if (!albumVisibleTo(actor, album)) throw new ApiError('not_found', 'There is no such album.');
    if (album.kind === 'manual') {
      return {
        text: ' and i.id in (select a.item_id from drive_album_items a where a.album_id = $albumId)',
        parameters: { albumId },
      };
    }
    const rule = compileSmartRule(album.rule, {
      reachProfileId: album.scope === 'home' ? null : album.ownerProfileId,
      starViewerId: actor.profileId,
      timeZone: this.timeZone(),
    });
    return {
      text: ` and i.id in (select id from drive_items where ${rule.text})`,
      parameters: rule.parameters,
    };
  }
}

export function narrowing(actor: DriveActor, scope: LibraryScope, albums: AlbumScopes): Statement {
  const parts: Statement[] = [{ text: FILTER_SQL[scope.filter], parameters: {} }];
  if (scope.placeId !== undefined) {
    parts.push({
      text: ' and m.place_id = $placeId',
      parameters: { placeId: String(scope.placeId) },
    });
  }
  if (scope.countryCode !== undefined) {
    parts.push({
      text: ' and m.place_id in (select p.id from drive_places p where p.country = $countryCode)',
      parameters: { countryCode: scope.countryCode.toUpperCase() },
    });
  }
  if (scope.camera !== undefined) {
    parts.push({
      text: ` and ${CAMERA_TEXT} = lower($camera)`,
      parameters: { camera: scope.camera },
    });
  }
  if (scope.duration !== undefined) {
    const filter = durationFilter(scope.duration);
    parts.push({ text: ` and ${filter.text}`, parameters: filter.parameters });
  }
  if (scope.text !== undefined) parts.push(textStatement(scope.text));
  if (scope.albumId !== undefined) parts.push(albums.statement(actor, scope.albumId));
  parts.push(dayRange(scope.from ?? null, scope.to ?? null));
  return joined(parts);
}
