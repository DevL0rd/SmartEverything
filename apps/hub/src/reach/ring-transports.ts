import type { AiOutreachRow, ClientRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import type { Store } from '../store/store';
import { clientsOf } from './presence';
import type { RingDevice, RingTransport } from './ringing';

export interface TransportDeps {
  readonly store: Pick<Store, 'host'>;
  readonly online: () => ReadonlySet<string>;
  readonly push: Pick<PushCommandChannel, 'send'>;
  readonly pushConfigured: () => boolean;
  readonly aiName: () => string;
  readonly log: Logger;
}

const SCREEN_PLATFORMS: ReadonlySet<ClientRow['platform']> = new Set(['desktop', 'web']);

async function connectedOf(
  deps: TransportDeps,
  personId: string,
  platforms: ReadonlySet<string>,
): Promise<ClientRow[]> {
  const clients = await clientsOf(deps.store, personId);
  const online = deps.online();
  return clients.filter((client) => platforms.has(client.platform) && online.has(client.id));
}

function desktopTransport(deps: TransportDeps): RingTransport {
  return {
    targets: (personId): Promise<ClientRow[]> => connectedOf(deps, personId, SCREEN_PLATFORMS),
    ring: (): Promise<string | null> => Promise.resolve(null),
    cancel: (): void => undefined,
    unreachable: (_personId, name): Promise<string> =>
      Promise.resolve(
        `Can't reach ${name}'s computer: the SmartEverything desktop app isn't open.`,
      ),
  };
}

function ringPayload(row: AiOutreachRow, caller: string): Readonly<Record<string, string | null>> {
  return {
    caller,
    outreachId: row.id,
    chatId: row.chat_id,
    reason: row.reason,
    expiresAt: row.expires_at,
  };
}

const ANDROID: ReadonlySet<string> = new Set(['android']);

function callKeyOf(outreachId: string): string {
  return `ai_call_${outreachId}`;
}

class PhoneTransport implements RingTransport {
  constructor(private readonly deps: TransportDeps) {}

  async targets(personId: string): Promise<ClientRow[]> {
    const [connected, pushable] = await Promise.all([
      connectedOf(this.deps, personId, ANDROID),
      this.pushable(personId),
    ]);
    const pushed = pushable.filter((client) => !connected.some((other) => other.id === client.id));
    return [...connected, ...pushed];
  }

  async ring(row: AiOutreachRow, clients: readonly ClientRow[]): Promise<string | null> {
    const reachable = new Set(await this.pushTargets());
    const online = this.deps.online();
    const outcomes = await Promise.all(
      clients
        .filter((client) => reachable.has(client.id) || !online.has(client.id))
        .map((client) =>
          this.deps.push.send({
            clientId: client.id,
            command: 'ai_ring',
            payload: ringPayload(row, this.deps.aiName()),
            collapseKey: callKeyOf(row.id),
          }),
        ),
    );
    clients
      .filter((client) => online.has(client.id) && !reachable.has(client.id))
      .forEach((client) => {
        this.deps.log.warn('reach.ring_foreground_only', {
          outreachId: row.id,
          clientId: client.id,
        });
      });
    const failures = outcomes.flatMap((outcome) =>
      outcome.outcome === 'sent' ? [] : [outcome.reason],
    );
    failures.forEach((reason) => {
      this.deps.log.warn('reach.ring_push_failed', { outreachId: row.id, reason });
    });
    const anyLive = clients.some((client) => online.has(client.id));
    return !anyLive && failures.length === outcomes.length ? failures.join(' ') : null;
  }

  cancel(row: AiOutreachRow, clients: readonly ClientRow[]): void {
    this.pushTargets().then(
      (targets) => {
        this.cancelOn(row, clients, new Set(targets));
      },
      (cause: unknown) => {
        this.deps.log.error('reach.ring_cancel_failed', cause, { outreachId: row.id });
      },
    );
  }

  private cancelOn(
    row: AiOutreachRow,
    clients: readonly ClientRow[],
    reachable: ReadonlySet<string>,
  ): void {
    clients
      .filter((client) => reachable.has(client.id))
      .forEach((client) => {
        this.deps.push
          .send({
            clientId: client.id,
            command: 'ai_ring_cancel',
            payload: { outreachId: row.id },
            collapseKey: callKeyOf(row.id),
          })
          .then(
            (outcome) => {
              if (outcome.outcome !== 'sent') {
                this.deps.log.warn('reach.ring_cancel_failed', {
                  outreachId: row.id,
                  reason: outcome.reason,
                });
              }
            },
            (cause: unknown) => {
              this.deps.log.error('reach.ring_cancel_failed', cause, { outreachId: row.id });
            },
          );
      });
  }

  async unreachable(personId: string, name: string): Promise<string> {
    const phones = (await clientsOf(this.deps.store, personId)).filter(
      (client) => client.platform === 'android',
    );
    if (phones.length === 0) {
      return `Can't reach ${name}'s phone: no phone with SmartEverything is paired to ${name}.`;
    }
    if (!this.deps.pushConfigured()) {
      return `Can't reach ${name}'s phone: the app isn't connected and push notifications aren't set up (Settings › Notifications › Push service).`;
    }
    return `Can't reach ${name}'s phone: the app isn't connected and hasn't signed up for push messages yet; open SmartEverything on the phone once.`;
  }

  private async pushTargets(): Promise<readonly string[]> {
    return this.deps.pushConfigured() ? this.deps.store.host.read('reachPushTargets', null) : [];
  }

  private async pushable(personId: string): Promise<ClientRow[]> {
    const [targets, clients] = await Promise.all([
      this.pushTargets(),
      clientsOf(this.deps.store, personId),
    ]);
    const reachable = new Set(targets);
    return clients.filter((client) => client.platform === 'android' && reachable.has(client.id));
  }
}

export function ringTransports(deps: TransportDeps): Readonly<Record<RingDevice, RingTransport>> {
  return { phone: new PhoneTransport(deps), desktop: desktopTransport(deps) };
}
