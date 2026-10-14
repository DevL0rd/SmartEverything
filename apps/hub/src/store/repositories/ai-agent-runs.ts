import { z } from 'zod';
import {
  AI_AGENT_RUN,
  AI_AGENT_TRACE,
  type AiAgentRun,
  type AiAgentState,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { AiChatsRepository } from './ai-chats';

const ROW = z.strictObject({ projection: SQL_JSON.pipe(AI_AGENT_RUN) });
const TRACE = z.strictObject({ event: SQL_JSON.pipe(AI_AGENT_TRACE) });
const TERMINAL: ReadonlySet<AiAgentState> = new Set([
  'completed',
  'stopped',
  'interrupted',
  'failed',
]);
const TRACE_LIMIT = 200;
export function agentSourceIdentity(run: AiAgentRun): string {
  return JSON.stringify([
    run.parent_chat_id,
    run.source,
    run.source_id,
    run.child_chat_id,
    run.runtime,
    run.device_id,
    run.session_id,
    run.source_generation,
  ]);
}
function currentChildIdQuery(childExpression: string): string {
  return `select candidate.id from ai_agent_runs candidate
    join assistant_events event on event.id=json_extract(candidate.projection,'$.source_id')
    where json_extract(candidate.projection,'$.child_chat_id')=${childExpression}
    and json_extract(candidate.projection,'$.source')='smarteverything'
    order by event.cursor desc limit 1`;
}

export class AiAgentRunsRepository {
  constructor(private readonly context: StoreContext) {}
  read(id: string): AiAgentRun {
    return found(this.find(id), 'agent run', id);
  }
  find(id: string): AiAgentRun | undefined {
    return this.context.sql.get(ROW, 'select projection from ai_agent_runs where id=$id', { id })
      ?.projection;
  }
  currentChild(chatId: string): AiAgentRun | undefined {
    return this.context.sql.get(
      ROW,
      `select projection from ai_agent_runs where id=(${currentChildIdQuery('$chat')})`,
      { chat: chatId },
    )?.projection;
  }
  ofChat(chatId: string): AiAgentRun[] {
    return this.context.sql
      .all(
        ROW,
        "select projection from ai_agent_runs where parent_chat_id=$chat or json_extract(projection,'$.child_chat_id')=$chat",
        { chat: chatId },
      )
      .map((row) => row.projection);
  }
  bySource(run: AiAgentRun): AiAgentRun | undefined {
    return this.context.sql.get(
      ROW,
      'select projection from ai_agent_runs where source_identity=$identity',
      { identity: agentSourceIdentity(run) },
    )?.projection;
  }
  list(
    parentChatId: string,
    query: {
      readonly cursor?: string | undefined;
      readonly state?: AiAgentState | undefined;
      readonly limit: number;
      readonly current_children_only?: boolean | undefined;
    },
  ): { runs: AiAgentRun[]; next_cursor: string | null } {
    const limit = z.int().min(1).max(200).parse(query.limit);
    const rows = this.context.sql
      .all(
        ROW,
        `select r.projection from ai_agent_runs r where r.parent_chat_id=$parent
         and ($state is null or r.state=$state) and ($cursor is null or r.id>$cursor)
         and ($currentOnly=0 or r.id=(${currentChildIdQuery("json_extract(r.projection,'$.child_chat_id')")}))
         order by r.id limit $limit`,
        {
          parent: parentChatId,
          state: query.state ?? null,
          cursor: query.cursor ?? null,
          limit: limit + 1,
          currentOnly: query.current_children_only === true ? 1 : 0,
        },
      )
      .map((row) => row.projection);
    const runs = rows.slice(0, limit);
    return { runs, next_cursor: rows.length > limit ? (runs.at(-1)?.id ?? null) : null };
  }
  upsert(input: AiAgentRun): AiAgentRun {
    const run = AI_AGENT_RUN.parse(input);
    return this.context.write(() => this.keep(run));
  }
  appendTrace(runId: string, input: z.infer<typeof AI_AGENT_TRACE>): void {
    const event = AI_AGENT_TRACE.parse(input);
    this.context.write(() => {
      this.read(runId);
      this.context.sql.run(
        'retain published agent trace',
        'insert or ignore into ai_agent_trace(run_id,seq,event) values($run,$seq,$event)',
        { run: runId, seq: event.seq, event: jsonText(event) },
      );
      const removed = this.context.sql.run(
        'bound published agent trace',
        'delete from ai_agent_trace where run_id=$run and seq not in (select seq from ai_agent_trace where run_id=$run order by seq desc limit $limit)',
        { run: runId, limit: TRACE_LIMIT },
      );
      if (removed > 0) this.markTruncated(runId);
    });
  }
  detail(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): {
    run: AiAgentRun;
    trace: z.infer<typeof AI_AGENT_TRACE>[];
    next_cursor: string | null;
    truncated: boolean;
  } {
    const run = this.read(id);
    const after = cursor === undefined ? 0 : z.coerce.number().int().nonnegative().parse(cursor);
    const take = z.int().min(1).max(200).parse(limit);
    const rows = this.context.sql
      .all(
        TRACE,
        'select event from ai_agent_trace where run_id=$id and seq>$after order by seq limit $limit',
        { id, after, limit: take + 1 },
      )
      .map((row) => row.event);
    const trace = rows.slice(0, take);
    return {
      run,
      trace,
      next_cursor: rows.length > take ? String(trace.at(-1)?.seq) : null,
      truncated: run.truncated,
    };
  }
  claimDelivery(id: string, destination: 'waiter' | 'parent'): boolean {
    this.read(id);
    return (
      this.context.sql.run(
        'record once-only agent report delivery',
        'insert or ignore into ai_agent_delivery(run_id,destination,delivered_at) values($id,$destination,$now)',
        { id, destination, now: this.context.now() },
      ) > 0
    );
  }
  private markTruncated(id: string): void {
    const run = this.read(id);
    if (run.truncated) return;
    this.context.sql.run(
      'mark bounded agent trace',
      'update ai_agent_runs set projection=$projection where id=$id',
      { id, projection: jsonText({ ...run, truncated: true }) },
    );
    const parent = new AiChatsRepository(this.context).chat(run.parent_chat_id);
    this.context.changed('ai_chats', 'UPDATE', parent, parent);
  }
  private keep(run: AiAgentRun): AiAgentRun {
    const parent = new AiChatsRepository(this.context).chat(run.parent_chat_id);
    if (parent.profile_id !== run.profile_id) throw new AgentRunBindingError(run.id);
    const previous = this.bySource(run);
    if (previous !== undefined) {
      if (
        run.source_revision < previous.source_revision ||
        (run.source_revision === previous.source_revision && run.source_seq <= previous.source_seq)
      )
        return previous;
      if (terminalRegression(previous, run)) return previous;
      if (run.id !== previous.id) throw new AgentRunBindingError(run.id);
    }
    const byId = this.find(run.id);
    if (byId !== undefined && agentSourceIdentity(byId) !== agentSourceIdentity(run))
      throw new AgentRunBindingError(run.id);
    const retained = retainTruncation(run, byId);
    this.context.sql.run(
      'save durable agent projection',
      `insert into ai_agent_runs(id,parent_chat_id,profile_id,source_identity,state,source_seq,source_revision,projection,updated_at) values($id,$parent,$profile,$identity,$state,$seq,$revision,$projection,$now) on conflict(id) do update set state=excluded.state,source_seq=excluded.source_seq,source_revision=excluded.source_revision,projection=excluded.projection,updated_at=excluded.updated_at`,
      {
        id: run.id,
        parent: run.parent_chat_id,
        profile: run.profile_id,
        identity: agentSourceIdentity(run),
        state: run.state,
        seq: run.source_seq,
        revision: run.source_revision,
        projection: jsonText(retained),
        now: run.updated_at,
      },
    );
    this.context.changed('ai_chats', 'UPDATE', parent, parent);
    return retained;
  }
}
export class AgentRunBindingError extends Error {
  override readonly name = 'AgentRunBindingError';
  constructor(readonly runId: string) {
    super(`Agent run ${runId} cannot change its source or owner binding.`);
  }
}

function terminalRegression(previous: AiAgentRun, run: AiAgentRun): boolean {
  return (
    TERMINAL.has(previous.state) &&
    !TERMINAL.has(run.state) &&
    run.source_revision <= previous.source_revision
  );
}

function retainTruncation(run: AiAgentRun, previous: AiAgentRun | undefined): AiAgentRun {
  return { ...run, truncated: run.truncated || previous?.truncated === true };
}
