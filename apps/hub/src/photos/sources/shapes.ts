import {
  ApiError,
  type DeviceScope,
  type SOURCE_PAGE,
  type PrivateDevices,
  type PhotoSource,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import type { ChangeEnv } from '../../drive/changes';
import type { SqlFilter } from '../../store/sql';

export type SourcePage = z.output<typeof SOURCE_PAGE>;

export interface SourceViewer {
  readonly profileId: string;
  readonly devices: (DeviceScope & Partial<PrivateDevices>) | null;
}

export type SourcesEnv = ChangeEnv;

export interface SourceQuery {
  readonly chipId?: string | undefined;
  readonly text?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly cursor?: string | undefined;
}

export interface SourceColumns {
  readonly name: string;
  readonly chipName: string;
  readonly at: string;
}

export function sourceNarrowing(query: SourceQuery, columns: SourceColumns): SqlFilter {
  const clauses: string[] = [];
  const parameters: Record<string, string> = {};
  if (query.text !== undefined) {
    clauses.push(
      `(instr(lower(${columns.name}), lower($sourceText)) > 0
        or instr(lower(${columns.chipName}), lower($sourceText)) > 0)`,
    );
    parameters['sourceText'] = query.text;
  }
  if (query.from !== undefined) {
    clauses.push(`date(${columns.at}) >= $sourceFrom`);
    parameters['sourceFrom'] = query.from;
  }
  if (query.to !== undefined) {
    clauses.push(`date(${columns.at}) <= $sourceTo`);
    parameters['sourceTo'] = query.to;
  }
  return { text: clauses.map((clause) => ` and ${clause}`).join(''), parameters };
}

export interface SourceService {
  readonly source: PhotoSource;
  readonly page: (viewer: SourceViewer, query: SourceQuery) => Promise<SourcePage>;
  readonly keep: (viewer: SourceViewer, itemIds: readonly string[]) => Promise<number>;
}

const CURSOR = z.strictObject({ at: z.iso.datetime({ offset: true }), id: z.uuid() });

export interface SourceCursor {
  readonly at: string;
  readonly id: string;
}

export function encodeCursor(cursor: SourceCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): SourceCursor | null {
  if (cursor === undefined) return null;
  try {
    return CURSOR.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      'The cursor is not one this list gave out.',
      messageOf(cause),
    );
  }
}
