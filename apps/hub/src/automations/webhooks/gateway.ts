import { background } from '@smarteverything/logging';
import { WEBHOOK_SOURCE, type JsonValue, type SignalInput } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { SignalBus } from '../../signals/bus';
import type { RunDriver } from '../driver/admission';
import type { FinishedRun } from '../driver/ports';
import type { WebhookReplies, WebhookReply } from '../effects/webhook-replies';

const WEBHOOK_REQUEST_KEY = 'request';

export interface WebhookCall {
  readonly path: string;
  readonly method: string;
  readonly body: JsonValue | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}

export interface StartedRun {
  readonly signal: Pick<SignalInput, 'source' | 'data'> | null;
  readonly runId: string;
  readonly automationId: string;
}

interface WebhookPorts {
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly replies: WebhookReplies;
  readonly clock: Pick<Clock, 'now'>;
  readonly token: () => string;
}

interface Engine {
  readonly outcome: (runId: string) => Promise<FinishedRun>;
  readonly driver: Pick<RunDriver, 'firstHold'>;
  readonly listensTo: (path: string) => boolean;
}

interface Started {
  readonly runId: string;
  readonly reply: Promise<WebhookReply>;
}

interface Call {
  readonly runs: Started[];
  readonly finished: FinishedRun[];
}

const ACCEPTED: WebhookReply = { status: 202, body: { accepted: true }, headers: {} };

const UNANSWERED: WebhookReply = { status: 204, body: undefined, headers: {} };

function failure(finished: readonly FinishedRun[]): WebhookReply | undefined {
  const broken = finished.find((run) => run.outcome !== 'succeeded');
  if (broken === undefined) return undefined;
  const error = broken.error ?? 'The automation failed before it answered.';
  return { status: 500, body: { error }, headers: {} };
}

function settled(call: Call): WebhookReply {
  return (
    failure(call.finished) ?? (call.finished.length === call.runs.length ? UNANSWERED : ACCEPTED)
  );
}

export class WebhookGateway {
  private engine: Engine | null = null;
  private readonly calls = new Map<string, Call>();

  constructor(private readonly ports: WebhookPorts) {}

  get replies(): WebhookReplies {
    return this.ports.replies;
  }

  attach(engine: Engine): void {
    this.engine = engine;
  }

  started(start: StartedRun): void {
    const token = start.signal?.data[WEBHOOK_REQUEST_KEY];
    const call =
      start.signal?.source === WEBHOOK_SOURCE && typeof token === 'string'
        ? this.calls.get(token)
        : undefined;
    if (call === undefined || this.engine === null) return;
    const { runId } = start;
    const { replies } = this.ports;
    call.runs.push({ runId, reply: replies.expect(runId) });
    background(
      this.engine.outcome(runId).then((finished) => {
        call.finished.push(finished);
        replies.release(runId);
      }),
      'webhook.settle_failed',
      { runId },
    );
  }

  async call(call: WebhookCall): Promise<WebhookReply | null> {
    const { engine } = this;
    if (engine?.listensTo(call.path) !== true) return null;
    const token = this.ports.token();
    const open: Call = { runs: [], finished: [] };
    this.calls.set(token, open);
    try {
      this.ports.signals.emit(this.signalOf(call, token));
    } finally {
      this.calls.delete(token);
    }
    if (open.runs.length === 0) return null;
    const parked = Promise.all(open.runs.map((run) => engine.driver.firstHold(run.runId))).then(
      () => settled(open),
    );
    return await Promise.race([...open.runs.map((run) => run.reply), parked]);
  }

  private signalOf(call: WebhookCall, token: string): SignalInput {
    const data: Record<string, JsonValue> = {
      method: call.method,
      headers: { ...call.headers },
      query: { ...call.query },
      [WEBHOOK_REQUEST_KEY]: token,
    };
    if (call.body !== undefined) data['body'] = call.body;
    return {
      source: WEBHOOK_SOURCE,
      kind: 'received',
      subject: null,
      field: call.path,
      value: true,
      previous: null,
      at: this.ports.clock.now().toISOString(),
      profileId: null,
      data,
    };
  }
}
