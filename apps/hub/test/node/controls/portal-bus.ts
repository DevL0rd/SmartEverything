import dbus from 'dbus-next';
import type {
  BusCall,
  SignalListener,
  SignalRule,
} from '../../../src/node/controls/linux/dbus-session';
import type { PortalBus } from '../../../src/node/controls/linux/portal-request';

export const SESSION = '/org/freedesktop/portal/desktop/session/1_42/se1';

export interface Scripted {
  readonly code: number;
  readonly results: Readonly<Record<string, dbus.Variant>>;
}

interface Watcher {
  readonly rule: SignalRule;
  readonly listener: SignalListener;
}

function tokenOf(request: BusCall): string {
  const options = (request.body ?? []).at(-1);
  if (typeof options !== 'object' || options === null) return '';
  const token: unknown = Reflect.get(options, 'handle_token');
  return token instanceof dbus.Variant && typeof token.value === 'string' ? token.value : '';
}

export function streamsVariant(
  streams: readonly { id: number; x: number; y: number; width: number; height: number }[],
): dbus.Variant {
  return new dbus.Variant(
    'a(ua{sv})',
    streams.map((stream) => [
      stream.id,
      {
        position: new dbus.Variant('(ii)', [stream.x, stream.y]),
        size: new dbus.Variant('(ii)', [stream.width, stream.height]),
      },
    ]),
  );
}

export class FakePortalBus implements PortalBus {
  readonly calls: BusCall[] = [];
  readonly watchers: Watcher[] = [];
  readonly answers = new Map<string, Scripted>();
  properties: unknown = null;
  failing: Error | null = null;

  uniqueName(): string {
    return ':1.42';
  }

  call(request: BusCall): Promise<readonly unknown[]> {
    this.calls.push(request);
    if (this.failing !== null) return Promise.reject(this.failing);
    if (request.member === 'Get') return Promise.resolve([this.properties]);
    const answer = this.answers.get(request.member);
    if (answer !== undefined) this.respond(request, answer);
    return Promise.resolve([]);
  }

  watch(rule: SignalRule, listener: SignalListener): Promise<() => void> {
    const watcher = { rule, listener };
    this.watchers.push(watcher);
    return Promise.resolve((): void => {
      this.watchers.splice(this.watchers.indexOf(watcher), 1);
    });
  }

  emit(rule: Pick<SignalRule, 'iface' | 'member' | 'path'>, body: readonly unknown[]): void {
    for (const watcher of [...this.watchers]) {
      const same =
        watcher.rule.iface === rule.iface &&
        watcher.rule.member === rule.member &&
        watcher.rule.path === rule.path;
      if (same) watcher.listener(body, ':1.1');
    }
  }

  members(): string[] {
    return this.calls.map((call) => call.member);
  }

  private respond(request: BusCall, answer: Scripted): void {
    const path = `/org/freedesktop/portal/desktop/request/1_42/${tokenOf(request)}`;
    queueMicrotask(() => {
      this.emit({ iface: 'org.freedesktop.portal.Request', member: 'Response', path }, [
        answer.code,
        answer.results,
      ]);
    });
  }
}

export function grantingBus(
  streams: readonly { id: number; x: number; y: number; width: number; height: number }[],
  restoreToken: string | null = 'new-token',
): FakePortalBus {
  const bus = new FakePortalBus();
  const ok = (results: Record<string, dbus.Variant> = {}): Scripted => ({ code: 0, results });
  bus.answers.set('CreateSession', ok({ session_handle: new dbus.Variant('s', SESSION) }));
  bus.answers.set('SelectDevices', ok());
  bus.answers.set('SelectSources', ok());
  bus.answers.set(
    'Start',
    ok({
      streams: streamsVariant(streams),
      ...(restoreToken === null ? {} : { restore_token: new dbus.Variant('s', restoreToken) }),
    }),
  );
  return bus;
}
