import type { AiOutreachRow, ClientRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import type { Store } from '../store/store';
import { clientsOf, type PresenceStore } from './presence';
import type { RingDevice, RingTransport } from './ringing';

export interface TransportDeps {
  readonly store: PresenceStore & Pick<Store, 'personal'>;
  readonly online: () => ReadonlySet<string>;
  readonly push: Pick<PushCommandChannel, 'send'>;
  readonly pushConfigured: () => boolean;
  readonly aiName: () => string;
  readonly log: Logger;
}

const SCREEN_PLATFORMS: ReadonlySet<ClientRow['platform']> = new Set(['desktop', 'web']);

function connectedOf(
  deps: TransportDeps,
  personId: string,
  platforms: ReadonlySet<string>,
): ClientRow[] {
  const online = deps.online();
  return clientsOf(deps.store, personId).filter(
    (client) => platforms.has(client.platform) && online.has(client.id),
  );
}

function desktopTransport(deps: TransportDeps): RingTransport {
  return {
    targets: (personId): ClientRow[] => connectedOf(deps, personId, SCREEN_PLATFORMS),
    ring: (): Promise<string | null> => Promise.resolve(null),
    cancel: (): void => undefined,
    unreachable: (_personId, name): string =>
      `Can't reach ${name}'s computer: the SmartEverything desktop app isn't open.`,
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

class PhoneTransport implements RingTransport {
  constructor(private readonly deps: TransportDeps) {}

  targets(personId: string): ClientRow[] {
    const connected = connectedOf(this.deps, personId, ANDROID);
    const pushed = this.pushable(personId).filter(
      (client) => !connected.some((other) => other.id === client.id),
    );
    return [...connected, ...pushed];
  }

  async ring(row: AiOutreachRow, clients: readonly ClientRow[]): Promise<string | null> {
    const online = this.deps.online();
    const live = clients.filter((client) => online.has(client.id));
    const offline = clients.filter((client) => !online.has(client.id));
    const outcomes = await Promise.all(
      offline.map((client) =>
        this.deps.push.send({
          clientId: client.id,
          command: 'ai_ring',
          payload: ringPayload(row, this.deps.aiName()),
        }),
      ),
    );
    const failures = outcomes.flatMap((outcome) =>
      outcome.outcome === 'sent' ? [] : [outcome.reason],
    );
    return live.length === 0 && failures.length === outcomes.length ? failures.join(' ') : null;
  }

  cancel(row: AiOutreachRow, clients: readonly ClientRow[]): void {
    const reachable = new Set(this.pushTargets());
    clients
      .filter((client) => reachable.has(client.id))
      .forEach((client) => {
        this.deps.push
          .send({ clientId: client.id, command: 'ai_ring_cancel', payload: { outreachId: row.id } })
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

  unreachable(personId: string, name: string): string {
    const phones = clientsOf(this.deps.store, personId).filter(
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

  private pushTargets(): readonly string[] {
    return this.deps.pushConfigured()
      ? this.deps.store.personal.pushTargets().map((target) => target.client_id)
      : [];
  }

  private pushable(personId: string): ClientRow[] {
    const reachable = new Set(this.pushTargets());
    return clientsOf(this.deps.store, personId).filter(
      (client) => client.platform === 'android' && reachable.has(client.id),
    );
  }
}

export function ringTransports(deps: TransportDeps): Readonly<Record<RingDevice, RingTransport>> {
  return { phone: new PhoneTransport(deps), desktop: desktopTransport(deps) };
}
