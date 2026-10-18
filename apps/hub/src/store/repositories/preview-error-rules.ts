import { PREVIEW_ERROR_RULE, type PreviewErrorRule } from '@smarteverything/domain';
import type { StoreContext } from '../context';

const COLUMNS = 'scope_key as scopeKey,fingerprint,reason,sample,created_at as createdAt';

export class PreviewErrorRulesRepository {
  constructor(private readonly context: StoreContext) {}

  list(chat: string): readonly PreviewErrorRule[] {
    return this.context.sql.all(
      PREVIEW_ERROR_RULE,
      `select ${COLUMNS} from preview_error_rules where chat_id=$chat order by created_at`,
      { chat },
    );
  }

  ignored(chat: string, scopeKey: string, fingerprint: string): boolean {
    return (
      this.context.sql.get(
        PREVIEW_ERROR_RULE,
        `select ${COLUMNS} from preview_error_rules where chat_id=$chat and scope_key=$scopeKey and fingerprint=$fingerprint`,
        { chat, scopeKey, fingerprint },
      ) !== undefined
    );
  }

  put(chat: string, input: Omit<PreviewErrorRule, 'createdAt'>): void {
    const rule = PREVIEW_ERROR_RULE.parse({ ...input, createdAt: this.context.now() });
    this.context.write(() =>
      this.context.sql.run(
        'ignore captured recurring browser error',
        `insert into preview_error_rules(chat_id,scope_key,fingerprint,reason,sample,created_at)
       values($chat,$scopeKey,$fingerprint,$reason,$sample,$createdAt)
       on conflict(chat_id,scope_key,fingerprint) do update set reason=excluded.reason`,
        { chat, ...rule },
      ),
    );
  }

  remove(chat: string, scopeKey: string, fingerprint: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'restore captured browser error notifications',
        'delete from preview_error_rules where chat_id=$chat and scope_key=$scopeKey and fingerprint=$fingerprint',
        { chat, scopeKey, fingerprint },
      ),
    );
  }
}
