import { OUTREACH_RING_SECONDS, type AiOutreachRow, type ClientRow } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { OutreachAnswer, OutreachAnswering } from '../assistant-voice/outreach';
import type { Cancel, Clock } from '../clock';
import type { NewOutreach } from '../store/repositories/ai-outreach';
import type { Store } from '../store/store';
import { ReachRefusedError } from './reach-errors';

export type RingDevice = 'phone' | 'desktop';

export interface RingTransport {
  readonly targets: (personId: string) => Promise<readonly ClientRow[]>;
  readonly ring: (row: AiOutreachRow, clients: readonly ClientRow[]) => Promise<string | null>;
  readonly cancel: (row: AiOutreachRow, clients: readonly ClientRow[]) => void;
  readonly unreachable: (personId: string, name: string) => Promise<string>;
}

export interface RingingOptions {
  readonly store: Pick<Store, 'host'>;
  readonly transports: Readonly<Record<RingDevice, RingTransport>>;
  readonly opening: (row: AiOutreachRow) => string;
  readonly closed: (row: AiOutreachRow) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Rung {
  readonly client: ClientRow;
  readonly device: RingDevice;
}

interface Ring {
  readonly row: AiOutreachRow;
  readonly rung: readonly Rung[];
  readonly cancel: Cancel;
}

export interface RingPlan {
  readonly devices: readonly RingDevice[];
  readonly only: string | null;
}

export type RingRequest = Omit<NewOutreach, 'state' | 'expires_at' | 'clients'>;

const RING_MS = OUTREACH_RING_SECONDS * 1000;

type Closing = 'missed' | 'declined' | 'ended' | 'failed';

export class Ringing {
  private readonly rings = new Map<string, Ring>();

  constructor(private readonly options: RingingOptions) {}

  async start(plan: RingPlan, outreach: RingRequest): Promise<AiOutreachRow> {
    const { host } = this.options.store;
    const rung = await this.targets(plan, outreach.profile_id);
    const expires = new Date(this.options.clock.now().getTime() + RING_MS);
    const row = await host.call('aiOutreach', 'add', {
      ...outreach,
      state: 'ringing',
      expires_at: expires.toISOString(),
      clients: rung.map((entry) => entry.client.id),
    });
    const cancel = this.options.clock.at(expires, () => {
      this.closeLater(
        row.id,
        'missed',
        `No answer after ${String(OUTREACH_RING_SECONDS)} seconds.`,
      );
    });
    this.rings.set(row.id, { row, rung, cancel });
    const refused = await this.ring(row, rung);
    if (refused !== null) {
      return this.close(row.id, 'failed', refused);
    }
    this.options.log.info('reach.ringing', { outreachId: row.id, apps: rung.length });
    return host.call('aiOutreach', 'byId', row.id);
  }

  answered(answering: OutreachAnswering): OutreachAnswer {
    const ring = this.rings.get(answering.outreachId);
    if (ring === undefined) {
      return { kind: 'refused', reason: 'This call is no longer ringing.' };
    }
    const { row } = ring;
    if (row.chat_id !== answering.chatId) {
      return { kind: 'refused', reason: 'This call belongs to a different chat.' };
    }
    if (!ring.rung.some((entry) => entry.client.id === answering.clientId)) {
      return { kind: 'refused', reason: 'This call was for a different device.' };
    }
    this.forget(row.id);
    background(
      this.options.store.host.call('aiOutreach', 'step', row.id, {
        state: 'live',
        callId: answering.callId,
        clientId: answering.clientId,
      }),
      'reach.answer_failed',
      { outreachId: row.id },
    );
    return { kind: 'answer', opening: this.options.opening(row), origin: row.origin };
  }

  async decline(outreachId: string, clientId: string): Promise<AiOutreachRow> {
    const ring = this.rings.get(outreachId);
    if (ring?.rung.some((entry) => entry.client.id === clientId) !== true) {
      throw new ReachRefusedError('This call is not ringing on this device.');
    }
    return this.close(outreachId, 'declined', 'They declined the call.', clientId);
  }

  async stop(outreachId: string): Promise<AiOutreachRow | null> {
    return this.rings.has(outreachId)
      ? this.close(outreachId, 'ended', 'The AI stopped ringing before anyone answered.')
      : null;
  }

  stopAll(): void {
    [...this.rings.keys()].forEach((id) => {
      this.closeLater(id, 'failed', 'The server stopped while it was ringing.');
    });
  }

  private async targets(plan: RingPlan, personId: string): Promise<Rung[]> {
    const { transports, store } = this.options;
    const found = await Promise.all(
      plan.devices.map(async (device) =>
        (await transports[device].targets(personId))
          .filter((client) => plan.only === null || client.id === plan.only)
          .map((client) => ({ client, device })),
      ),
    );
    const rung = found.flat();
    if (rung.length === 0) {
      const { name } = await store.host.call('profiles', 'byId', personId);
      const reasons = await Promise.all(
        plan.devices.map((device) => transports[device].unreachable(personId, name)),
      );
      throw new ReachRefusedError(reasons.join(' '));
    }
    return rung;
  }

  private async ring(row: AiOutreachRow, rung: readonly Rung[]): Promise<string | null> {
    const devices = [...new Set(rung.map((entry) => entry.device))];
    const refusals = await Promise.all(
      devices.map((device) => this.options.transports[device].ring(row, clientsOn(rung, device))),
    );
    const failed = refusals.filter((refusal) => refusal !== null);
    return failed.length === refusals.length ? failed.join(' ') : null;
  }

  private closeLater(outreachId: string, state: Closing, detail: string): void {
    background(this.close(outreachId, state, detail), 'reach.ring_close_failed', { outreachId });
  }

  private async close(
    outreachId: string,
    state: Closing,
    detail: string,
    clientId?: string,
  ): Promise<AiOutreachRow> {
    this.forget(outreachId);
    const row = await this.options.store.host.call('aiOutreach', 'step', outreachId, {
      state,
      detail,
      ...(clientId === undefined ? {} : { clientId }),
    });
    this.options.closed(row);
    return row;
  }

  private forget(outreachId: string): void {
    const ring = this.rings.get(outreachId);
    if (ring === undefined) {
      return;
    }
    this.rings.delete(outreachId);
    ring.cancel();
    const devices = new Set(ring.rung.map((entry) => entry.device));
    devices.forEach((device) => {
      this.options.transports[device].cancel(ring.row, clientsOn(ring.rung, device));
    });
  }
}

function clientsOn(rung: readonly Rung[], device: RingDevice): ClientRow[] {
  return rung.filter((entry) => entry.device === device).map((entry) => entry.client);
}
