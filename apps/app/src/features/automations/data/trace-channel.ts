import {
  AUTOMATION_TRACE_NOTICE,
  demandSubject,
  type AutomationTraceNotice,
  type AutomationWatchDemand,
  type AutomationWatchMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { compareText } from '../../../format/text';

const log = new Logger('app.automations');

export type TraceListener = (notice: AutomationTraceNotice) => void;

export interface TraceChannel {
  readonly hold: (demand: AutomationWatchDemand, listener: TraceListener) => () => void;
}

type Send = (message: AutomationWatchMessage) => void;

interface Hold {
  readonly demand: AutomationWatchDemand;
  readonly listener: TraceListener;
}

const NOTHING = '[]';

function noticeSubjects(notice: AutomationTraceNotice): readonly string[] {
  return notice.type === 'trace_keyframe'
    ? [
        demandSubject({ automationId: notice.automationId }),
        ...notice.runs.map((run) => demandSubject({ runId: run.runId })),
      ]
    : [
        demandSubject({ automationId: notice.automationId }),
        demandSubject({ runId: notice.runId }),
      ];
}

export function demandsOf(holds: Iterable<Hold>): AutomationWatchDemand[] {
  const bySubject = new Map<string, AutomationWatchDemand>();
  for (const { demand } of holds) bySubject.set(demandSubject(demand), demand);
  return [...bySubject]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, demand]) => demand);
}

export class TraceRegistry implements TraceChannel {
  private readonly holds = new Set<Hold>();
  private send: Send | null = null;
  private sent = NOTHING;

  readonly hold = (demand: AutomationWatchDemand, listener: TraceListener): (() => void) => {
    const hold: Hold = { demand, listener };
    this.holds.add(hold);
    this.flush();
    return (): void => {
      if (!this.holds.delete(hold)) return;
      this.flush();
    };
  };

  attach(send: Send): void {
    this.send = send;
    this.sent = NOTHING;
    this.flush();
  }

  detach(): void {
    this.send = null;
    this.sent = NOTHING;
  }

  deliver(raw: unknown): void {
    const parsed = AUTOMATION_TRACE_NOTICE.safeParse(raw);
    if (!parsed.success) {
      log.error('trace.notice_invalid', parsed.error);
      return;
    }
    const notice = parsed.data;
    const subjects = new Set(noticeSubjects(notice));
    for (const hold of [...this.holds]) {
      if (subjects.has(demandSubject(hold.demand))) hold.listener(notice);
    }
  }

  private flush(): void {
    const send = this.send;
    if (send === null) return;
    const demands = demandsOf(this.holds);
    const signature = JSON.stringify(demands);
    if (signature === this.sent) return;
    this.sent = signature;
    log.debug('trace.watch_sent', { demands: demands.length });
    send({ type: 'watch_automations', demands });
  }
}

export const automationTrace = new TraceRegistry();
