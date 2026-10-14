import {
  TRANSCRIPT_HIT,
  TRANSCRIPT_PAGE_LIMIT,
  type TranscriptHit,
  type TranscriptPage,
  type TranscriptRange,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import {
  readTranscriptCursor,
  transcriptCursor,
  transcriptMatch,
  transcriptSqlScope,
  type TranscriptScope,
  type TranscriptSqlScope,
  type TranscriptPosition,
} from './transcript-reader-scope';
export type { TranscriptScope } from './transcript-reader-scope';

const HIT = storedRow(TRANSCRIPT_HIT, { json: ['session', 'line'] });
const LIMIT = z.int().min(1).max(TRANSCRIPT_PAGE_LIMIT);
const COLUMNS = `json_object('id',s.id,'source',s.source,'source_id',s.source_id,'plugin_id',s.plugin_id,
 'title',s.title,'retention_days',s.retention_days,'started_at',s.started_at,'ended_at',s.ended_at,
 'last_line_at',s.last_line_at,'line_count',s.line_count,'participants',json(s.participants)) as session,
 json_object('id',l.id,'session_id',l.session_id,'at',l.at,'ended_at',l.ended_at,'timing',l.timing,
 'speaker_id',l.speaker_id,'speaker',l.speaker,'text',l.text,'bot',json(case l.bot when 1 then 'true' else 'false' end)) as line`;
const JOIN = 'transcript_lines l join transcript_sessions s on s.id = l.session_id';
export interface TranscriptFeedQuery {
  readonly cursor?: string | undefined;
  readonly direction?: 'before' | 'after' | undefined;
  readonly limit: number;
  readonly words?: string | undefined;
}
interface ReadQuery {
  readonly position?: TranscriptPosition;
  readonly direction: 'before' | 'after';
  readonly limit: number;
  readonly match?: string;
}

export class TranscriptReaderRepository {
  constructor(private readonly context: StoreContext) {}
  feed(scope: TranscriptScope, query: TranscriptFeedQuery): TranscriptPage {
    const filter = transcriptSqlScope(scope, query.words);
    const match = query.words === undefined ? undefined : transcriptMatch(query.words);
    if (match === null) return { items: [], before: null, after: null };
    const position =
      query.cursor === undefined ? undefined : readTranscriptCursor(query.cursor, filter.identity);
    const read = {
      direction: query.direction ?? 'before',
      limit: LIMIT.parse(query.limit),
      ...(position === undefined ? {} : { position }),
      ...(match === undefined ? {} : { match }),
    };
    return this.page(filter, this.rows(filter, read), match);
  }
  range(scope: TranscriptScope, anchorId: number, limit: number): TranscriptRange {
    const filter = transcriptSqlScope(scope);
    const anchor = this.context.sql.get(
      HIT,
      `select ${COLUMNS} from ${JOIN} where ${filter.clause} and l.id = $anchor`,
      { ...filter.parameters, anchor: z.int().min(1).parse(anchorId) },
    );
    if (anchor === undefined)
      return { anchor: null, page: { items: [], before: null, after: null } };
    const count = LIMIT.parse(limit);
    const before = Math.floor((count - 1) / 2);
    const position = anchor.line;
    const older =
      before === 0 ? [] : this.rows(filter, { position, direction: 'before', limit: before });
    const newer = this.rows(filter, { position, direction: 'after', limit: count - before - 1 });
    return { anchor: anchor.line, page: this.page(filter, [...older, anchor, ...newer]) };
  }
  private rows(filter: TranscriptSqlScope, query: ReadQuery): TranscriptHit[] {
    const compare = query.direction === 'before' ? '<' : '>';
    const order = query.direction === 'before' ? 'desc' : 'asc';
    const boundary = query.position === undefined ? '' : ` and (l.at, l.id) ${compare} ($at, $id)`;
    const fts =
      query.match === undefined ? '' : ' join transcript_lines_search f on f.rowid = l.id';
    const matching = query.match === undefined ? '' : ' and transcript_lines_search match $match';
    const rows = this.context.sql.all(
      HIT,
      `select ${COLUMNS} from ${JOIN}${fts} where ${filter.clause}${boundary}${matching} order by l.at ${order}, l.id ${order} limit $limit`,
      {
        ...filter.parameters,
        limit: query.limit,
        ...(query.position === undefined ? {} : { at: query.position.at, id: query.position.id }),
        ...(query.match === undefined ? {} : { match: query.match }),
      },
    );
    return query.direction === 'before' ? rows.reverse() : rows;
  }
  private page(filter: TranscriptSqlScope, items: TranscriptHit[], match?: string): TranscriptPage {
    const first = items[0]?.line;
    const last = items.at(-1)?.line;
    return {
      items,
      before: first === undefined ? null : this.edge(filter, first, 'before', match),
      after: last === undefined ? null : this.edge(filter, last, 'after', match),
    };
  }
  private edge(
    filter: TranscriptSqlScope,
    position: TranscriptPosition,
    direction: 'before' | 'after',
    match?: string,
  ): string | null {
    const rows = this.rows(filter, {
      position,
      direction,
      limit: 1,
      ...(match === undefined ? {} : { match }),
    });
    return rows.length === 0 ? null : transcriptCursor(position, filter.identity);
  }
}
