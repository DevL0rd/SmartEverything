import {
  TRANSCRIPT_LINE,
  TRANSCRIPT_LINES_MAX,
  TRANSCRIPT_PARTICIPANTS_MAX,
  TRANSCRIPT_SESSION,
  type TranscriptLine,
  type TranscriptLineInput,
  type TranscriptSession,
  type TranscriptSource,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SESSION = storedRow(TRANSCRIPT_SESSION, { json: ['participants'] });

const STORED_LINE = storedRow(TRANSCRIPT_LINE, { flags: ['bot'] });

const SESSION_COLUMNS =
  'id, source, source_id, plugin_id, title, retention_days, started_at, ended_at, last_line_at, line_count, participants';

const LINE_COLUMNS = 'id, session_id, at, speaker_id, speaker, text, bot';

const SPENT = z.strictObject({ spent: z.int().min(0) });

const NEXT_EXPIRY = z.strictObject({ next: z.string().nullable() });

const EXPIRY_AT =
  "strftime('%Y-%m-%dT%H:%M:%fZ', coalesce(last_line_at, started_at), '+' || coalesce(retention_days, $days) || ' days')";

export interface NewTranscriptSession {
  readonly source: TranscriptSource;
  readonly sourceId: string;
  readonly pluginId: string | null;
  readonly title: string;
  readonly retentionDays: number | null;
  readonly startedAt: string;
}

export interface TranscriptListQuery {
  readonly source?: TranscriptSource | undefined;
  readonly sourceId?: string | undefined;
  readonly before?: string | undefined;
  readonly limit: number;
}

export interface TranscriptSearchQuery {
  readonly words: string;
  readonly source?: TranscriptSource | undefined;
  readonly sourceId?: string | undefined;
  readonly limit: number;
}

function sourceFilter(query: {
  readonly source?: TranscriptSource | undefined;
  readonly sourceId?: string | undefined;
}): { readonly clause: string; readonly parameters: Record<string, SQLInputValue> } {
  const clauses: string[] = [];
  const parameters: Record<string, SQLInputValue> = {};
  if (query.source !== undefined) {
    clauses.push('s.source = $source');
    parameters['source'] = query.source;
  }
  if (query.sourceId !== undefined) {
    clauses.push('s.source_id = $sourceId');
    parameters['sourceId'] = query.sourceId;
  }
  return { clause: clauses.map((clause) => ` and ${clause}`).join(''), parameters };
}

function matchOf(words: string): string | null {
  const tokens = words.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) {
    return null;
  }
  return tokens
    .map((token, index) => `"${token}"${index === tokens.length - 1 ? '*' : ''}`)
    .join(' ');
}

export class TranscriptsRepository {
  constructor(private readonly context: StoreContext) {}

  open(session: NewTranscriptSession): TranscriptSession {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'open the transcript',
        `insert into transcript_sessions (id, source, source_id, plugin_id, title, retention_days, started_at)
         values ($id, $source, $sourceId, $pluginId, $title, $retention, $startedAt)`,
        {
          id,
          source: session.source,
          sourceId: session.sourceId,
          pluginId: session.pluginId,
          title: session.title.slice(0, 200),
          retention: session.retentionDays,
          startedAt: moment(session.startedAt),
        },
      );
      return this.byId(id);
    });
  }

  find(id: string): TranscriptSession | undefined {
    return this.context.sql.get(
      STORED_SESSION,
      `select ${SESSION_COLUMNS} from transcript_sessions where id = $id`,
      { id },
    );
  }

  byId(id: string): TranscriptSession {
    return found(this.find(id), 'transcript', id);
  }

  list(query: TranscriptListQuery): TranscriptSession[] {
    const filter = sourceFilter(query);
    const before = query.before === undefined ? '' : ' and s.started_at < $before';
    return this.context.sql.all(
      STORED_SESSION,
      `select ${SESSION_COLUMNS.split(', ')
        .map((column) => `s.${column}`)
        .join(', ')} from transcript_sessions s where 1 = 1${filter.clause}${before}
       order by s.started_at desc, s.rowid desc limit $limit`,
      {
        ...filter.parameters,
        ...(query.before === undefined ? {} : { before: moment(query.before) }),
        limit: query.limit,
      },
    );
  }

  append(sessionId: string, line: TranscriptLineInput): TranscriptLine {
    return this.context.write(() => {
      const session = this.byId(sessionId);
      this.context.sql.run(
        'add the transcript line',
        `insert into transcript_lines (session_id, at, speaker_id, speaker, text, bot)
         values ($sessionId, $at, $speakerId, $speaker, $text, $bot)`,
        {
          sessionId,
          at: moment(line.at),
          speakerId: line.speaker_id,
          speaker: line.speaker,
          text: line.text,
          bot: line.bot ? 1 : 0,
        },
      );
      const added = found(
        this.context.sql.get(
          STORED_LINE,
          `select ${LINE_COLUMNS} from transcript_lines where session_id = $sessionId order by id desc limit 1`,
          { sessionId },
        ),
        'transcript line',
        sessionId,
      );
      this.touch(session, added);
      return added;
    });
  }

  lines(sessionId: string, after: number, limit: number): TranscriptLine[] {
    return this.context.sql.all(
      STORED_LINE,
      `select ${LINE_COLUMNS} from transcript_lines where session_id = $sessionId and id > $after
       order by id limit $limit`,
      { sessionId, after, limit },
    );
  }

  recent(sessionId: string, since: string, limit: number): TranscriptLine[] {
    return this.context.sql
      .all(
        STORED_LINE,
        `select ${LINE_COLUMNS} from transcript_lines where session_id = $sessionId and at >= $since
         order by id desc limit $limit`,
        { sessionId, since: moment(since), limit },
      )
      .reverse();
  }

  search(query: TranscriptSearchQuery): { session: TranscriptSession; line: TranscriptLine }[] {
    const match = matchOf(query.words);
    if (match === null) {
      return [];
    }
    const filter = sourceFilter(query);
    const lines = this.context.sql.all(
      STORED_LINE,
      `select ${LINE_COLUMNS.split(', ')
        .map((column) => `l.${column}`)
        .join(', ')} from transcript_lines_search f
       join transcript_lines l on l.id = f.rowid
       join transcript_sessions s on s.id = l.session_id
       where transcript_lines_search match $match${filter.clause}
       order by l.id desc limit $limit`,
      { ...filter.parameters, match, limit: query.limit },
    );
    return lines.map((line) => ({ session: this.byId(line.session_id), line }));
  }

  close(id: string, at: string): TranscriptSession {
    return this.context.write(() => {
      this.context.sql.run(
        'close the transcript',
        'update transcript_sessions set ended_at = coalesce(ended_at, $at) where id = $id',
        { id, at: moment(at) },
      );
      return this.byId(id);
    });
  }

  closeOpen(source: TranscriptSource, at: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'close the unfinished transcripts',
        `update transcript_sessions set ended_at = coalesce(last_line_at, started_at)
         where ended_at is null and source = $source and started_at <= $at`,
        { source, at: moment(at) },
      ),
    );
  }

  remove(id: string): TranscriptSession {
    return this.context.write(() => {
      const session = this.byId(id);
      this.context.sql.run(
        'remove the transcript lines',
        'delete from transcript_lines where session_id = $id',
        {
          id,
        },
      );
      this.context.sql.run(
        'remove the transcript',
        'delete from transcript_sessions where id = $id',
        {
          id,
        },
      );
      return session;
    });
  }

  prune(now: string, standardDays: number): number {
    return this.context.write(() => {
      const parameters = { now: moment(now), days: standardDays };
      const expired = `select id from transcript_sessions where ${EXPIRY_AT} <= $now`;
      this.context.sql.run(
        'remove the expired transcript lines',
        `delete from transcript_lines where session_id in (${expired})`,
        parameters,
      );
      return this.context.sql.run(
        'remove the expired transcripts',
        `delete from transcript_sessions where id in (${expired})`,
        parameters,
      );
    });
  }

  nextExpiry(standardDays: number): string | null {
    const row = this.context.sql.get(
      NEXT_EXPIRY,
      `select min(${EXPIRY_AT}) as next from transcript_sessions`,
      { days: standardDays },
    );
    return row?.next ?? null;
  }

  listeningSpent(from: string): number {
    const row = this.context.sql.get(
      SPENT,
      `select coalesce(sum(cost_micros), 0) as spent from ai_usage
       where work = 'transcribe' and source in ('gemini', 'openrouter') and plugin_id is null and at >= $from`,
      { from: moment(from) },
    );
    if (row === undefined) {
      throw new Error('The transcribing spend query returned no row.');
    }
    return row.spent;
  }

  private touch(session: TranscriptSession, line: TranscriptLine): void {
    const names = session.participants.includes(line.speaker)
      ? session.participants
      : [...session.participants, line.speaker].slice(0, TRANSCRIPT_PARTICIPANTS_MAX);
    const overflow = Math.max(0, session.line_count + 1 - TRANSCRIPT_LINES_MAX);
    if (overflow > 0) {
      this.context.sql.run(
        'drop the oldest transcript lines',
        `delete from transcript_lines where id in
           (select id from transcript_lines where session_id = $id order by id limit $overflow)`,
        { id: session.id, overflow },
      );
    }
    this.context.sql.run(
      'update the transcript',
      `update transcript_sessions set last_line_at = $at, line_count = $count, participants = $participants
       where id = $id`,
      {
        id: session.id,
        at: line.at,
        count: session.line_count + 1 - overflow,
        participants: jsonText(names),
      },
    );
  }
}
