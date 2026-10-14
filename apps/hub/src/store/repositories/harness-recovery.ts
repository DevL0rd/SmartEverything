import { HarnessEffectsRepository } from './harness-effects';
import { DSH_SESSION_CREATE, DSH_SESSION_ACQUIRE } from '@smarteverything/domain';
import { z } from 'zod';
import { AI_HARNESS_EVENT, HARNESS_RUNTIME_REQUEST, ApiError } from '@smarteverything/domain';
import type { AiHarnessEvent } from '@smarteverything/domain';
import { CONVERSATION_AUTHORITY } from '../../harness/authority-contract';
import type { ConversationAuthority } from '../../harness/authority-contract';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';
import { durableSessionWrite } from './dsh-session-durability';
const ADMISSION = z.object({
  signature: z.string(),
  request: SQL_JSON.pipe(z.union([DSH_SESSION_CREATE, DSH_SESSION_ACQUIRE])),
});
const OPENING = z.object({
  signature: z.string(),
  request: SQL_JSON.pipe(HARNESS_RUNTIME_REQUEST),
  state: z.enum(['pending', 'ready', 'failed']),
  failure: z.string().nullable(),
});
export class HarnessRecoveryRepository {
  readonly effects: HarnessEffectsRepository;
  constructor(private readonly context: StoreContext) {
    this.effects = new HarnessEffectsRepository(context);
  }
  authority(id: string): ConversationAuthority | undefined {
    return this.context.sql.get(
      z.object({ authority: SQL_JSON.pipe(CONVERSATION_AUTHORITY) }),
      'select authority from harness_authorities where event_id=$id',
      { id },
    )?.authority;
  }
  latestAuthority(chat: string): ConversationAuthority | undefined {
    return this.context.sql.get(
      z.object({ authority: SQL_JSON.pipe(CONVERSATION_AUTHORITY) }),
      'select a.authority from harness_authorities a join assistant_events e on e.id=a.event_id where e.chat_id=$chat order by e.cursor desc limit 1',
      { chat },
    )?.authority;
  }
  authorize(input: ConversationAuthority): void {
    const authority = CONVERSATION_AUTHORITY.parse(input);
    this.context.sql.run(
      'retain initiating conversation authority',
      'insert into harness_authorities(event_id,authority) values($id,$authority) on conflict(event_id) do nothing',
      { id: authority.event_id, authority: jsonText(authority) },
    );
    if (jsonText(this.authority(authority.event_id)) !== jsonText(authority))
      throw new ApiError('conflict', 'An initiating event authority cannot be replaced.');
  }
  retained(event: AiHarnessEvent): AiHarnessEvent | undefined {
    const row = this.context.sql.get(
      z.object({ payload: SQL_JSON.pipe(AI_HARNESS_EVENT), source: z.string() }),
      'select payload,source from harness_outbox where session_id=$session and epoch=$epoch and seq=$seq',
      identity(event),
    );
    if (row !== undefined && row.source !== jsonText(event))
      throw new ApiError(
        'conflict',
        'Native event identity was reused with different source payload.',
      );
    return row?.payload;
  }
  keep(event: AiHarnessEvent, source: AiHarnessEvent = event): void {
    this.context.sql.run(
      'retain native delivery payload',
      'insert into harness_outbox(session_id,epoch,seq,payload,source) values($session,$epoch,$seq,$payload,$source) on conflict(session_id,epoch,seq) do nothing',
      { ...identity(event), payload: jsonText(event), source: jsonText(source) },
    );
    const row = this.context.sql.get(
      z.object({ payload: z.string() }),
      'select payload from harness_outbox where session_id=$session and epoch=$epoch and seq=$seq',
      identity(event),
    );
    if (row?.payload !== jsonText(event))
      throw new ApiError(
        'conflict',
        'A native projection identity was reused with different payload.',
      );
  }
  pending(consumer: string, session?: string): AiHarnessEvent[] {
    return this.context.sql
      .all(
        z.object({ payload: SQL_JSON.pipe(AI_HARNESS_EVENT) }),
        'select o.payload from harness_outbox o where ($session is null or o.session_id=$session) and not exists(select 1 from harness_consumers c where c.session_id=o.session_id and c.epoch=o.epoch and c.seq=o.seq and c.consumer=$consumer) order by o.rowid',
        { consumer, session: session ?? null },
      )
      .map((row) => row.payload);
  }
  consumed(event: AiHarnessEvent, consumer: string): boolean {
    return (
      this.context.sql.get(
        z.object({ seq: z.number() }),
        'select seq from harness_consumers where session_id=$session and epoch=$epoch and seq=$seq and consumer=$consumer',
        { ...identity(event), consumer },
      ) !== undefined
    );
  }
  ack(event: AiHarnessEvent, consumer: string): void {
    const write = (): void => {
      this.context.sql.run(
        'acknowledge retained native payload',
        'insert into harness_consumers(session_id,epoch,seq,consumer) values($session,$epoch,$seq,$consumer) on conflict do nothing',
        { ...identity(event), consumer },
      );
    };
    if (this.context.sql.inTransaction()) write();
    else durableSessionWrite(this.context, write);
  }
  nativeAdmission(chat: string): z.infer<typeof ADMISSION> | undefined {
    return this.context.sql.get(
      ADMISSION,
      'select signature,request from harness_admissions where chat_id=$chat',
      { chat },
    );
  }
  admitNative(chat: string, signature: string, request: unknown): void {
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain native acquisition intent before claiming ownership',
        'insert into harness_admissions(chat_id,signature,request) values($chat,$signature,$request) on conflict(chat_id) do update set signature=excluded.signature,request=excluded.request',
        {
          chat,
          signature,
          request: jsonText(z.union([DSH_SESSION_CREATE, DSH_SESSION_ACQUIRE]).parse(request)),
        },
      ),
    );
  }
  opening(chat: string): z.infer<typeof OPENING> | undefined {
    return this.context.sql.get(
      OPENING,
      'select signature,request,state,failure from harness_openings where chat_id=$chat',
      { chat },
    );
  }
  opened(chat: string, signature: string, request: unknown): void {
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain native open admission',
        "insert into harness_openings(chat_id,signature,request,state) values($chat,$signature,$request,'pending') on conflict(chat_id) do update set signature=excluded.signature,request=excluded.request,state=excluded.state,failure=null",
        { chat, signature, request: jsonText(HARNESS_RUNTIME_REQUEST.parse(request)) },
      ),
    );
  }
  openingOutcome(chat: string, state: 'ready' | 'failed', failure: string | null = null): void {
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'settle native open admission',
        'update harness_openings set state=$state,failure=$failure where chat_id=$chat',
        { chat, state, failure },
      ),
    );
  }
  fork(chat: string, parent: string, boundary: number): void {
    this.context.sql.run(
      'record exact native fork boundary',
      'insert into harness_forks(chat_id,parent_session,boundary) values($chat,$parent,$boundary)',
      { chat, parent, boundary },
    );
  }
  forkOf(chat: string): { readonly parent_session: string; readonly boundary: number } | undefined {
    return this.context.sql.get(
      z.object({ parent_session: z.string(), boundary: z.int().nonnegative() }),
      'select parent_session,boundary from harness_forks where chat_id=$chat',
      { chat },
    );
  }
}
function identity(event: AiHarnessEvent): {
  readonly session: string;
  readonly epoch: number;
  readonly seq: number;
} {
  return { session: event.session_id, epoch: event.epoch, seq: event.seq };
}
