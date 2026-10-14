import { createHash } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';

export type TranscriptScope =
  | { readonly kind: 'camera'; readonly cameraIds: readonly string[]; readonly actor: string }
  | {
      readonly kind: 'plugin';
      readonly pluginId: string;
      readonly actor: string;
      readonly sourceId?: string;
    };
export interface TranscriptPosition {
  readonly at: string;
  readonly id: number;
}
export interface TranscriptSqlScope {
  readonly clause: string;
  readonly parameters: Record<string, SQLInputValue>;
  readonly identity: string;
}
const POSITION = z.strictObject({ at: z.iso.datetime(), id: z.int().min(1), scope: z.string() });

export function transcriptSqlScope(scope: TranscriptScope, words?: string): TranscriptSqlScope {
  const selector =
    scope.kind === 'camera'
      ? { cameraIds: [...scope.cameraIds].sort() }
      : { pluginId: scope.pluginId, sourceId: scope.sourceId };
  const identity = createHash('sha256')
    .update(JSON.stringify({ ...scope, ...selector, words }))
    .digest('hex');
  if (scope.kind === 'camera')
    return {
      identity,
      clause:
        "s.source = 'camera' and s.plugin_id is null and s.source_id in (select value from json_each($cameraIds))",
      parameters: { cameraIds: JSON.stringify(scope.cameraIds) },
    };
  return {
    identity,
    clause:
      "s.source = 'plugin' and s.plugin_id = $pluginId" +
      (scope.sourceId === undefined ? '' : ' and s.source_id = $sourceId'),
    parameters: {
      pluginId: scope.pluginId,
      ...(scope.sourceId === undefined ? {} : { sourceId: scope.sourceId }),
    },
  };
}

export function transcriptCursor(position: TranscriptPosition, identity: string): string {
  return Buffer.from(
    JSON.stringify({ at: position.at, id: position.id, scope: identity }),
  ).toString('base64url');
}
export function readTranscriptCursor(cursor: string, identity: string): TranscriptPosition {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      `Expected an encoded transcript cursor; decoding failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const parsed = POSITION.safeParse(raw);
  if (!parsed.success || parsed.data.scope !== identity)
    throw new ApiError(
      'invalid_request',
      'The transcript cursor belongs to a different reader, source or search.',
    );
  return parsed.data;
}
export function transcriptMatch(words: string): string | null {
  const tokens = words.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return null;
  return tokens
    .map((token, index) => `"${token}"${index === tokens.length - 1 ? '*' : ''}`)
    .join(' ');
}
