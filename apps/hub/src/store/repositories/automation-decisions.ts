import { AUTOMATION_DECISION, type AutomationDecision } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

export const DECISION_WINDOW_MS = 60_000;

const STORED_DECISION = storedRow(AUTOMATION_DECISION, { json: ['detail'] });
const COLUMNS = Object.keys(AUTOMATION_DECISION.shape).join(',');

export function decisionWindowStart(at: string): string {
  const time = new Date(moment(at)).getTime();
  return new Date(time - (time % DECISION_WINDOW_MS)).toISOString();
}

export interface DroppedRun {
  readonly automationId: string;
  readonly reason: AutomationDecision['reason'];
  readonly at: string;
  readonly times?: number;
  readonly detail?: AutomationDecision['detail'];
}

export class AutomationDecisionsRepository {
  constructor(private readonly context: StoreContext) {}

  record(dropped: DroppedRun): void {
    const at = moment(dropped.at);
    this.context.sql.run(
      'record why an automation did not run',
      `insert into automation_decisions(automation_id,window_start,reason,count,first_at,last_at,detail)
       values($automationId,$windowStart,$reason,$times,$at,$at,$detail)
       on conflict(automation_id,window_start,reason) do update set
         count = count + $times,
         first_at = min(first_at, $at),
         last_at = max(last_at, $at),
         detail = coalesce(detail, $detail)`,
      {
        automationId: dropped.automationId,
        windowStart: decisionWindowStart(at),
        reason: dropped.reason,
        times: dropped.times ?? 1,
        at,
        detail:
          dropped.detail === undefined || dropped.detail === null ? null : jsonText(dropped.detail),
      },
    );
  }

  forAutomation(automationId: string, since: string | null, limit: number): AutomationDecision[] {
    return this.context.sql.all(
      STORED_DECISION,
      `select ${COLUMNS} from automation_decisions where automation_id=$automationId and ($since is null or window_start >= $since) order by window_start desc, reason limit $limit`,
      { automationId, since: since === null ? null : moment(since), limit },
    );
  }

  sweepBefore(before: string): number {
    return this.context.sql.run(
      'forget old automation decisions',
      'delete from automation_decisions where window_start < $before',
      { before: moment(before) },
    );
  }
}
