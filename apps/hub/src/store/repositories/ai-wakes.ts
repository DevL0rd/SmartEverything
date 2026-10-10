import { AI_WAKE_ROW, type AiWakeRow } from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const STORED_WAKE = storedRow(AI_WAKE_ROW, {});

const COLUMNS =
  'id, profile_id, chat_id, automation_id, automation_name, headline, instruction, state, reason, created_at';

const KEPT_DAYS = 90;
const DAY_MS = 86_400_000;

export type NewAiWake = Omit<AiWakeRow, 'id' | 'created_at'>;

export class AiWakesRepository {
  constructor(private readonly context: StoreContext) {}

  add(wake: NewAiWake): AiWakeRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'forget old AI wakes',
        'delete from ai_wakes where created_at < $before',
        { before: new Date(Date.parse(now) - KEPT_DAYS * DAY_MS).toISOString() },
      );
      this.context.sql.run(
        'record the AI wake',
        `insert into ai_wakes (${COLUMNS})
         values ($id, $profile, $chat, $automation, $name, $headline, $instruction, $state, $reason, $now)`,
        {
          id,
          profile: wake.profile_id,
          chat: wake.chat_id,
          automation: wake.automation_id,
          name: wake.automation_name,
          headline: wake.headline,
          instruction: wake.instruction,
          state: wake.state,
          reason: wake.reason,
          now,
        },
      );
      return { ...wake, id, created_at: now };
    });
  }

  recent(profileId: string, limit: number): AiWakeRow[] {
    return this.context.sql.all(
      STORED_WAKE,
      `select ${COLUMNS} from ai_wakes where profile_id = $profileId
       order by created_at desc, rowid desc limit $limit`,
      { profileId, limit },
    );
  }
}
