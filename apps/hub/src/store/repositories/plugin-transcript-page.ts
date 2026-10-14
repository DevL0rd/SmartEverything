import { TRANSCRIPT_LINE, type TranscriptLine } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const LINE = storedRow(TRANSCRIPT_LINE, { flags: ['bot'] });
const TOTAL = z.strictObject({ total: z.int().nonnegative() });
const QUERY = z.strictObject({
  start: z.int().nonnegative(),
  limit: z.int().min(1).max(1500),
  since: z.iso.datetime().optional(),
});

export interface PluginTranscriptPageQuery {
  readonly start: number;
  readonly limit: number;
  readonly since?: string;
}

export interface PluginTranscriptPage {
  readonly lines: readonly TranscriptLine[];
  readonly total: number;
}

export class PluginTranscriptPageRepository {
  constructor(private readonly context: StoreContext) {}

  read(
    pluginId: string,
    sessionId: string,
    query: PluginTranscriptPageQuery,
  ): PluginTranscriptPage {
    const input = QUERY.parse(query);
    const scope = `s.source = 'plugin' and s.plugin_id = $pluginId and s.id = $sessionId`;
    const since = input.since === undefined ? '' : ' and l.at >= $since';
    const join = 'transcript_lines l join transcript_sessions s on s.id = l.session_id';
    const parameters = {
      pluginId,
      sessionId,
      ...(input.since === undefined ? {} : { since: input.since }),
    };
    const counted = this.context.sql.get(
      TOTAL,
      `select count(*) as total from ${join} where ${scope}${since}`,
      parameters,
    );
    if (counted === undefined) throw new PluginTranscriptCountError(sessionId);
    const lines = this.context.sql.all(
      LINE,
      `select l.* from ${join} where ${scope}${since} order by l.id limit $limit offset $start`,
      {
        ...parameters,
        limit: input.limit,
        start: input.start,
      },
    );
    return { lines, total: counted.total };
  }
}

class PluginTranscriptCountError extends Error {
  override readonly name = 'PluginTranscriptCountError';

  constructor(readonly sessionId: string) {
    super(`Expected a transcript line count for ${sessionId}; SQL returned no row.`);
  }
}
