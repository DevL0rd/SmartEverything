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
      'select a.authority from harness_authorities a join assistant_events e on e.id=a.event_id where e.chat_id=$chat order by e.cursor desc limit 1',
      { chat },
    )?.authority;
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
