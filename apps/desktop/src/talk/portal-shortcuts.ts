import { randomBytes } from 'node:crypto';
import { Message, MessageType, Variant, sessionBus, type MessageBus } from '@jellybrick/dbus-next';
import type { DesktopTalkCommand, DesktopTalkShortcuts } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { TALK_SHORTCUTS, type TalkCommandSink, type TalkKeys } from './talk-keys.js';

const log = new Logger('desktop.talk');

const PORTAL = 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
const SHORTCUTS = 'org.freedesktop.portal.GlobalShortcuts';
const REQUEST = 'org.freedesktop.portal.Request';
const RESPONSE_TIMEOUT_MS = 120_000;

const RESPONSE = z.tuple([z.number(), z.record(z.string(), z.unknown())]);
const SIGNAL = z.tuple([z.string(), z.string()]).rest(z.unknown());
const VARIANT_TEXT = z.object({ value: z.string() });
const BOUND = z.array(z.tuple([z.string(), z.record(z.string(), z.unknown())]));
const RETURNED_PATH = z.tuple([z.string()]);

class PortalRefusedError extends Error {
  override readonly name = 'PortalRefusedError';
}

function token(): string {
  return `se${randomBytes(6).toString('hex')}`;
}

function call(
  bus: MessageBus,
  member: string,
  signature: string,
  body: unknown[],
): Promise<Message | null> {
  return bus.call(
    new Message({
      destination: PORTAL,
      path: PORTAL_PATH,
      interface: SHORTCUTS,
      member,
      signature,
      body,
    }),
  );
}

function addMatch(bus: MessageBus, rule: string): Promise<Message | null> {
  return bus.call(
    new Message({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'AddMatch',
      signature: 's',
      body: [rule],
    }),
  );
}

function connected(bus: MessageBus): Promise<void> {
  return new Promise((resolve) => {
    if (bus.name !== null) {
      resolve();
      return;
    }
    bus.once('connect', () => {
      resolve();
    });
  });
}

class Portal {
  private readonly waiting = new Map<string, (results: Record<string, unknown>) => void>();
  private session: string | null = null;
  private triggers: {
    talk: string | null;
    next: string | null;
    assistant: string | null;
    assistantMute: string | null;
  } = { talk: null, next: null, assistant: null, assistantMute: null };
  private problem: string | null = null;

  constructor(
    private readonly bus: MessageBus,
    private readonly sink: TalkCommandSink,
  ) {
    bus.on('message', (message) => {
      this.received(message);
    });
  }

  async open(): Promise<void> {
    await connected(this.bus);
    await addMatch(this.bus, `type='signal',interface='${REQUEST}',member='Response'`);
    await addMatch(this.bus, `type='signal',interface='${SHORTCUTS}'`);
    const created = await this.request('CreateSession', 'a{sv}', (handle) => [
      { handle_token: new Variant('s', handle), session_handle_token: new Variant('s', token()) },
    ]);
    this.session = VARIANT_TEXT.parse(created['session_handle']).value;
    await this.bind();
  }

  status(): DesktopTalkShortcuts {
    return { backend: 'portal', hold: true, ...this.triggers, problem: this.problem };
  }

  async configure(): Promise<DesktopTalkShortcuts> {
    if (this.session !== null) {
      await call(this.bus, 'ConfigureShortcuts', 'osa{sv}', [this.session, '', {}]);
    }
    return this.status();
  }

  failed(reason: string): void {
    this.problem = reason;
  }

  private async bind(): Promise<void> {
    const session = this.session;
    if (session === null) {
      return;
    }
    const shortcuts = TALK_SHORTCUTS.map((shortcut) => [
      shortcut.id,
      {
        description: new Variant('s', shortcut.description),
        preferred_trigger: new Variant('s', shortcut.preferredTrigger),
      },
    ]);
    const bound = await this.request('BindShortcuts', 'oa(sa{sv})sa{sv}', (handle) => [
      session,
      shortcuts,
      '',
      { handle_token: new Variant('s', handle) },
    ]);
    this.remember(bound['shortcuts']);
  }

  private remember(value: unknown): void {
    const parsed = z.object({ value: BOUND }).safeParse(value);
    if (!parsed.success) {
      return;
    }
    const describe = (id: string): string | null => {
      const found = parsed.data.value.find(([name]) => name === id);
      const text = VARIANT_TEXT.safeParse(found?.[1]['trigger_description']);
      return text.success && text.data.value !== '' ? text.data.value : null;
    };
    this.triggers = {
      talk: describe('talk'),
      next: describe('next'),
      assistant: describe('assistant'),
      assistantMute: describe('assistant_mute'),
    };
  }

  private async request(
    member: string,
    signature: string,
    body: (handle: string) => unknown[],
  ): Promise<Record<string, unknown>> {
    const handle = token();
    const sender = (this.bus.name ?? '').replace(/^:/, '').replaceAll('.', '_');
    const expected = `${PORTAL_PATH}/request/${sender}/${handle}`;
    const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(expected);
        reject(new PortalRefusedError(`The desktop did not answer ${member} in time.`));
      }, RESPONSE_TIMEOUT_MS);
      this.waiting.set(expected, (results) => {
        clearTimeout(timer);
        resolve(results);
      });
    });
    const reply = await call(this.bus, member, signature, body(handle));
    const path = RETURNED_PATH.parse(reply?.body)[0];
    if (path !== expected) {
      throw new PortalRefusedError(`The desktop answered ${member} on an unexpected path.`);
    }
    return answer;
  }

  private received(message: Message): void {
    if (message.type !== MessageType.SIGNAL) {
      return;
    }
    if (message.interface === REQUEST && message.member === 'Response') {
      this.responded(message);
      return;
    }
    if (message.interface !== SHORTCUTS) {
      return;
    }
    if (message.member === 'ShortcutsChanged') {
      this.remember({ value: SIGNAL.parse(message.body)[1] });
      return;
    }
    this.pressed(message);
  }

  private responded(message: Message): void {
    const answer = this.waiting.get(message.path);
    const parsed = RESPONSE.safeParse(message.body);
    if (answer === undefined || !parsed.success) {
      return;
    }
    this.waiting.delete(message.path);
    const [code, results] = parsed.data;
    if (code !== 0) {
      this.problem =
        code === 1 ? 'You turned the shortcuts down' : 'The desktop refused the shortcuts';
    }
    answer(results);
  }

  private pressed(message: Message): void {
    const parsed = SIGNAL.safeParse(message.body);
    if (!parsed.success || parsed.data[0] !== this.session) {
      return;
    }
    const command = shortcutCommand(parsed.data[1], message.member === 'Activated', message.member);
    if (command !== null) {
      this.sink(command);
    }
  }
}

function shortcutCommand(id: string, down: boolean, member: string): DesktopTalkCommand | null {
  const edge = down ? 'press' : 'release';
  if (!down && member !== 'Deactivated') {
    return null;
  }
  if (id === 'talk') {
    return { kind: edge };
  }
  if (id === 'assistant') {
    return { kind: 'assistant', phase: edge };
  }
  if (id === 'assistant_mute') {
    return down ? { kind: 'assistant_mute' } : null;
  }
  return id === 'next' && down ? { kind: 'next' } : null;
}

export function portalTalkKeys(sink: TalkCommandSink): TalkKeys {
  const bus = sessionBus();
  const portal = new Portal(bus, sink);
  portal.open().catch((cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : String(cause);
    log.warn('desktop.talk.portal_failed', { reason });
    portal.failed('This desktop offers no global shortcuts (xdg-desktop-portal GlobalShortcuts)');
  });
  return {
    status: () => portal.status(),
    configure: () => portal.configure(),
    stop: (): void => {
      bus.disconnect();
    },
  };
}
