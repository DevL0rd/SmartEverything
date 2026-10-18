import type { SQLInputValue } from 'node:sqlite';
import { ApiError, type TranscriptSource } from '@smarteverything/domain';
import { z } from 'zod';
import { messageOf } from '@smarteverything/logging';

export interface TranscriptScope {
  readonly source: TranscriptSource;
  readonly sourceIds?: readonly string[];
  readonly sessionId?: string;
}
export interface TranscriptPosition {
  readonly at: string;
  readonly id: number;
}
export interface TranscriptSqlScope {
  readonly clause: string;
  readonly parameters: Record<string, SQLInputValue>;
}
const POSITION = z.strictObject({ at: z.iso.datetime(), id: z.int().min(1) });

export function transcriptSqlScope(scope: TranscriptScope): TranscriptSqlScope {
  const clauses = ['s.source = $source'];
  const parameters: Record<string, SQLInputValue> = { source: scope.source };
  if (scope.sourceIds !== undefined) {
    clauses.push('s.source_id in (select value from json_each($sourceIds))');
    parameters['sourceIds'] = JSON.stringify(scope.sourceIds);
  }
  if (scope.sessionId !== undefined) {
    clauses.push('s.id = $sessionId');
    parameters['sessionId'] = scope.sessionId;
  }
  return { clause: clauses.join(' and '), parameters };
}

export function transcriptCursor(position: TranscriptPosition): string {
  return Buffer.from(JSON.stringify({ at: position.at, id: position.id })).toString('base64url');
}
export function readTranscriptCursor(cursor: string): TranscriptPosition {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      `Expected an encoded transcript cursor; decoding failed: ${messageOf(cause)}`,
    );
  }
  const parsed = POSITION.safeParse(raw);
  if (!parsed.success)
    throw new ApiError('invalid_request', 'Expected a transcript cursor from an earlier page.');
  return parsed.data;
}
export function transcriptMatch(words: string): string | null {
  const tokens = words.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return null;
  return tokens
    .map((token, index) => `"${token}"${index === tokens.length - 1 ? '*' : ''}`)
    .join(' ');
}
