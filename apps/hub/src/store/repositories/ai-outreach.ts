import { AI_OUTREACH_ROW, type AiOutreachRow, type OutreachState } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_OUTREACH = storedRow(AI_OUTREACH_ROW, { flags: ['urgent'], json: ['clients'] });

const COUNTED = storedRow(z.strictObject({ count: z.int().min(0) }), {});

const COLUMNS =
  'id, profile_id, chat_id, from_chat_id, how, target, target_label, reason, urgent, state, detail, call_id, client_id, clients, created_at, answered_at, ended_at, expires_at';

const KEPT_DAYS = 90;
const DAY_MS = 86_400_000;

export type NewOutreach = Pick<
  AiOutreachRow,
  | 'profile_id'
  | 'chat_id'
  | 'from_chat_id'
  | 'how'
  | 'target'
  | 'target_label'
  | 'reason'
  | 'urgent'
  | 'state'
  | 'detail'
  | 'expires_at'
> & { readonly clients?: readonly string[] };

export interface OutreachStep {
  readonly state: OutreachState;
  readonly detail?: string | null;
  readonly callId?: string;
  readonly clientId?: string;
}

const CLOSED: ReadonlySet<OutreachState> = new Set([
  'ended',
  'missed',
  'declined',
  'failed',
  'sent',
]);

export class AiOutreachRepository {
  constructor(private readonly context: StoreContext) {}

  add(outreach: NewOutreach): AiOutreachRow {
    return this.context.write(() => {
      const now = this.context.now();
      this.context.sql.run(
        'forget old AI outreach',
        'delete from ai_outreach where created_at < $before',
        { before: new Date(Date.parse(now) - KEPT_DAYS * DAY_MS).toISOString() },
      );
      const row: AiOutreachRow = {
        ...outreach,
        clients: [...(outreach.clients ?? [])],
        id: this.context.newId(),
        call_id: null,
        client_id: null,
        created_at: now,
        answered_at: null,
        ended_at: CLOSED.has(outreach.state) ? now : null,
      };
      this.context.sql.run(
        'record the AI outreach',
        `insert into ai_outreach (${COLUMNS})
         values ($id, $profile, $chat, $from, $how, $target, $label, $reason, $urgent, $state,
                 $detail, null, null, $clients, $now, null, $ended, $expires)`,
        {
          id: row.id,
          profile: row.profile_id,
          chat: row.chat_id,
          from: row.from_chat_id,
          how: row.how,
          target: row.target,
          label: row.target_label,
          reason: row.reason,
          urgent: flag(row.urgent),
          state: row.state,
          detail: row.detail,
          clients: jsonText(row.clients),
          now,
          ended: row.ended_at,
          expires: row.expires_at,
        },
      );
      this.context.changed('ai_outreach', 'INSERT', row, null);
      return row;
    });
  }

  byId(id: string): AiOutreachRow {
    return found(this.find(id), 'AI outreach', id);
  }

  find(id: string): AiOutreachRow | undefined {
    return this.context.sql.get(
      STORED_OUTREACH,
      `select ${COLUMNS} from ai_outreach where id = $id`,
      { id },
    );
  }

  step(id: string, step: OutreachStep): AiOutreachRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const now = this.context.now();
      const after: AiOutreachRow = {
        ...before,
        state: step.state,
        detail: step.detail === undefined ? before.detail : step.detail,
        call_id: step.callId ?? before.call_id,
        client_id: step.clientId ?? before.client_id,
        answered_at: step.state === 'live' ? now : before.answered_at,
        ended_at: CLOSED.has(step.state) ? now : before.ended_at,
      };
      this.context.sql.run(
        'update the AI outreach',
        `update ai_outreach set state = $state, detail = $detail, call_id = $call,
           client_id = $client, answered_at = $answered, ended_at = $ended where id = $id`,
        {
          id,
          state: after.state,
          detail: after.detail,
          call: after.call_id,
          client: after.client_id,
          answered: after.answered_at,
          ended: after.ended_at,
        },
      );
      this.context.changed('ai_outreach', 'UPDATE', after, before);
      return after;
    });
  }

  recent(profileId: string, limit: number): AiOutreachRow[] {
    return this.context.sql.all(
      STORED_OUTREACH,
      `select ${COLUMNS} from ai_outreach where profile_id = $profileId
       order by created_at desc, rowid desc limit $limit`,
      { profileId, limit },
    );
  }

  open(): AiOutreachRow[] {
    return this.context.sql.all(
      STORED_OUTREACH,
      `select ${COLUMNS} from ai_outreach where state in ('ringing', 'live') order by created_at`,
      {},
    );
  }

  callsSince(profileId: string, after: string): number {
    const counted = this.context.sql.get(
      COUNTED,
      `select count(*) as count from ai_outreach
       where profile_id = $profileId and created_at >= $after and how != 'message'`,
      { profileId, after },
    );
    return found(counted, 'AI outreach count for', profileId).count;
  }
}
