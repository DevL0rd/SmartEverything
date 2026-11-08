import { HarnessEffectsRepository } from './harness-effects';
import { z } from 'zod';
import { CONVERSATION_AUTHORITY } from '../../harness/authority-contract';
import type { ConversationAuthority } from '../../harness/authority-contract';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';
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
      `select a.authority from harness_authorities a join assistant_events e on e.id=a.event_id
       where e.chat_id=$chat
       order by e.cursor desc limit 1`,
      { chat },
    )?.authority;
  }
  claimTurn(sessionId: string, nativeTurn: number | undefined, eventId: string): void {
    const turn = z.int().nonnegative().parse(nativeTurn);
    this.context.sql.run(
      'retain actual claimed native turn authority',
      'insert into harness_turn_authorities(session_id,native_turn,event_id) values($sessionId,$turn,$eventId) on conflict do nothing',
      { sessionId, turn, eventId },
    );
  }
  turnAuthorities(sessionId: string, nativeTurn: number): readonly ConversationAuthority[] {
    return this.context.sql
      .all(
        z.object({ authority: SQL_JSON.pipe(CONVERSATION_AUTHORITY) }),
        `select a.authority from harness_turn_authorities t
       join harness_authorities a on a.event_id=t.event_id
       where t.session_id=$sessionId and t.native_turn=$nativeTurn order by t.rowid`,
        { sessionId, nativeTurn },
      )
      .map(({ authority }) => authority);
  }
  authorize(input: ConversationAuthority): void {
    const authority = CONVERSATION_AUTHORITY.parse(input);
    this.context.sql.run(
      'retain initiating conversation authority',
      'insert into harness_authorities(event_id,authority) values($id,$authority)',
      { id: authority.event_id, authority: jsonText(authority) },
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
