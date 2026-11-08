import {
  AI_REPAIR_ADMISSION,
  AI_REPAIR_PATCH_REQUEST,
  AI_REPAIR_GROUP,
  type AiRepairAdmission,
  type AiRepairDismissal,
  type AiRepairPage,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText, type SqlParameters } from '../sql';

const STORED_GROUP = AI_REPAIR_GROUP.extend({
  admission: SQL_JSON.pipe(AI_REPAIR_ADMISSION).nullable(),
});
const PATCH_APPROVAL = AI_REPAIR_PATCH_REQUEST.pick({ revision: true, paths: true });
const FINGERPRINT_ROW = AI_REPAIR_GROUP.pick({ fingerprint: true });
const VISIBLE = 'g.observations > g.dismissed_observations';
const INACTIVE = `not exists (
  select 1 from assistant_events e
  where e.id = json_extract(g.admission, '$.eventId') and e.answered_at is null
)`;

export interface AiRepairPageQuery {
  readonly lastAt?: string | undefined;
  readonly fingerprint?: string | undefined;
  readonly limit: number;
}

export class AiRepairInboxRepository {
  constructor(private readonly context: StoreContext) {}

  patchApproval(eventId: string): z.infer<typeof PATCH_APPROVAL> | null {
    return (
      this.context.sql.get(
        z.object({ approval: SQL_JSON.pipe(PATCH_APPROVAL) }),
        'select approval from ai_repair_source_approvals where event_id=$eventId',
        { eventId },
      )?.approval ?? null
    );
  }

  recordPatchApproval(eventId: string, input: z.infer<typeof PATCH_APPROVAL>): void {
    const approval = PATCH_APPROVAL.parse(input);
    this.context.sql.run(
      'retain approved repair source scope',
      'insert into ai_repair_source_approvals(event_id, approval) values($eventId,$approval)',
      { eventId, approval: jsonText(approval) },
    );
  }

  mayAutoAdmit(fingerprint: string): boolean {
    return (
      this.context.sql.get(
        FINGERPRINT_ROW,
        `select g.fingerprint from ai_repair_groups g
       where g.fingerprint = $fingerprint and ${VISIBLE} and g.failed_event_id is null and not exists (
         select 1 from assistant_events e where e.id = json_extract(g.admission, '$.eventId')
       ) and (g.automatic_admitted = 0 or json_extract(g.admission, '$.kind') = 'held')`,
        { fingerprint },
      ) !== undefined
    );
  }

  pendingAutomatic(retryFailed = false): readonly {
    readonly fingerprint: string;
    readonly logId: number;
    readonly clientId: string | null;
  }[] {
    return this.context.sql.all(
      z.object({
        fingerprint: z.string(),
        logId: z.int().positive(),
        clientId: z.string().nullable(),
      }),
      `select g.fingerprint, g.latest_log_id as logId, l.client_id as clientId
       from ai_repair_groups g join runtime_logs l on l.id = g.latest_log_id
       where ${VISIBLE} and ($retryFailed = 1 or g.failed_event_id is null) and not exists (
         select 1 from assistant_events e
         where e.id = json_extract(g.admission, '$.eventId')
       ) and (g.automatic_admitted = 0 or json_extract(g.admission, '$.kind') = 'held')
       order by g.first_at, g.fingerprint`,
      { retryFailed: Number(retryFailed) },
    );
  }

  recordAutomaticFailure(fingerprint: string, eventId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'retain the failed automatic repair admission',
        `update ai_repair_groups set admission = $admission,
         failed_event_id = $eventId, automatic_admitted = 1 where fingerprint = $fingerprint
         and not exists (select 1 from assistant_events where id = $eventId)`,
        { fingerprint, eventId, admission: jsonText({ kind: 'held', reason: 'unavailable' }) },
      );
    });
  }

  retryAutomaticFailure(fingerprint: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'retry an unavailable automatic repair after its destination changes',
        `update ai_repair_groups set admission = null, failed_event_id = null, automatic_admitted = 0
         where fingerprint = $fingerprint and failed_event_id is not null
         and json_extract(admission, '$.kind') = 'held'`,
        { fingerprint },
      );
    });
  }

  markAutomaticAdmitted(fingerprint: string): void {
    this.context.sql.run(
      'consume automatic diagnosis for the error group',
      'update ai_repair_groups set automatic_admitted = 1 where fingerprint = $fingerprint',
      { fingerprint },
    );
  }

  markFailed(eventId: string): void {
    this.context.sql.run(
      'record a failed repair diagnosis',
      `update ai_repair_groups set failed_event_id = $eventId
       where admission is not null and json_extract(admission, '$.eventId') = $eventId`,
      { eventId },
    );
  }

  latestLogId(fingerprint: string): number | null {
    return (
      this.context.sql.get(
        z.object({ id: z.int().positive().nullable() }),
        'select latest_log_id as id from ai_repair_groups where fingerprint = $fingerprint',
        { fingerprint },
      )?.id ?? null
    );
  }

  isVisible(fingerprint: string): boolean {
    return (
      this.context.sql.get(
        FINGERPRINT_ROW,
        `select g.fingerprint from ai_repair_groups g where g.fingerprint = $fingerprint and ${VISIBLE}`,
        { fingerprint },
      ) !== undefined
    );
  }

  fingerprintForEvent(eventId: string): string | null {
    return (
      this.context.sql.get(
        FINGERPRINT_ROW,
        `select fingerprint from ai_repair_groups
         where admission is not null and json_extract(admission, '$.eventId') = $eventId`,
        { eventId },
      )?.fingerprint ?? null
    );
  }

  recordAdmission(fingerprint: string, admission: AiRepairAdmission): void {
    this.context.write(() => {
      this.context.sql.run(
        'record the AI repair admission',
        `update ai_repair_groups set admission = $admission,
         failed_event_id = case when $held = 0 then null else failed_event_id end
         where fingerprint = $fingerprint
         and not ($held = 1 and exists (
           select 1 from assistant_events where id = json_extract(ai_repair_groups.admission, '$.eventId')
           and answered_at is null
         ))`,
        {
          fingerprint,
          admission: jsonText(admission),
          held: Number(admission.kind === 'held'),
        },
      );
    });
  }

  dismiss(dismissal: AiRepairDismissal): number {
    const group: { readonly clause: string; readonly parameters: SqlParameters } =
      dismissal.kind === 'group'
        ? {
            clause: 'and g.fingerprint = $fingerprint and g.observations = $observations',
            parameters: {
              fingerprint: dismissal.fingerprint,
              observations: dismissal.observations,
            },
          }
        : { clause: '', parameters: {} };
    return this.context.write(() =>
      this.context.sql.run(
        'dismiss inactive error groups from the inbox',
        `update ai_repair_groups as g
         set dismissed_observations = observations
         where ${VISIBLE} ${group.clause} and ${INACTIVE}`,
        group.parameters,
      ),
    );
  }

  list({ lastAt, fingerprint, limit }: AiRepairPageQuery): AiRepairPage {
    const groups = this.context.sql.all(
      STORED_GROUP,
      `select g.fingerprint, g.component, g.event, g.first_at as firstAt, g.last_at as lastAt,
              g.observations, g.latest_log_id as latestLogId, g.admission,
              case
                when json_extract(g.admission, '$.kind') = 'held' and g.failed_event_id is not null then 'failed'
                when json_extract(g.admission, '$.eventId') is null then null
                when e.id is null then 'unavailable'
                when e.id = g.failed_event_id then 'failed'
                when e.answered_at is not null then 'finished'
                when e.delivered_at is not null then 'running'
                else 'queued'
              end as progress
       from ai_repair_groups g
       left join assistant_events e on e.id = json_extract(g.admission, '$.eventId')
       where ${VISIBLE}
         and ($lastAt is null or (last_at, fingerprint) < ($lastAt, $fingerprint))
       order by last_at desc, fingerprint desc
       limit $window`,
      { lastAt: lastAt ?? null, fingerprint: fingerprint ?? null, window: limit + 1 },
    );
    const page = groups.slice(0, limit);
    const last = page.at(-1);
    return {
      groups: page,
      next:
        groups.length > limit && last !== undefined
          ? { lastAt: last.lastAt, fingerprint: last.fingerprint }
          : null,
    };
  }
}
