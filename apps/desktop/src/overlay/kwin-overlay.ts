import { Message, MessageType, NameFlag, sessionBus } from '@jellybrick/dbus-next';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { READY_NAME, kwinEventOf, type KwinEvent } from './kwin-events.js';

const log = new Logger('desktop.overlay');

export const KWIN_SCRIPT_NAME = 'smarteverything-overlay';

const KWIN = 'org.kde.KWin';
const SCRIPTING_PATH = '/Scripting';
const SCRIPTING = 'org.kde.kwin.Scripting';
const SCRIPT = 'org.kde.kwin.Script';
const DBUS = 'org.freedesktop.DBus';

const SCRIPT_ID = z.tuple([z.number()]);
const FLAG = z.tuple([z.boolean()]);

export interface KwinBus {
  readonly name: string | null;
  call(message: Message): Promise<{ readonly body: unknown[] } | null>;
  once(event: 'connect', listener: () => void): unknown;
  on(event: 'message', listener: (message: Message) => void): unknown;
  requestName(name: string, flags?: number): Promise<number>;
  disconnect(): void;
}

class KwinRefusedError extends Error {
  override readonly name = 'KwinRefusedError';
}

export class KwinScriptSilentError extends Error {
  override readonly name = 'KwinScriptSilentError';
}

export type KwinLoad = 'loaded' | 'absent';

export interface KwinPort {
  load(): Promise<KwinLoad>;
  loaded(): Promise<boolean>;
  onRestart(listener: () => void): void;
  onEvent(listener: (event: KwinEvent) => void): void;
  unload(): Promise<void>;
}

interface Request {
  readonly destination: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
  readonly signature?: string;
  readonly body?: unknown[];
}

async function ask(bus: KwinBus, request: Request): Promise<unknown[]> {
  const reply = await bus.call(new Message(request));
  return reply?.body ?? [];
}

function connected(bus: KwinBus): Promise<void> {
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

async function kwinRunning(bus: KwinBus): Promise<boolean> {
  const answer = await ask(bus, {
    destination: DBUS,
    path: '/org/freedesktop/DBus',
    interface: DBUS,
    member: 'NameHasOwner',
    signature: 's',
    body: [KWIN],
  });
  return FLAG.parse(answer)[0];
}

function scripting(member: string, signature: string, body: unknown[]): Request {
  return {
    destination: KWIN,
    path: SCRIPTING_PATH,
    interface: SCRIPTING,
    member,
    signature,
    body,
  };
}

async function unloadBy(bus: KwinBus): Promise<void> {
  await ask(bus, scripting('unloadScript', 's', [KWIN_SCRIPT_NAME]));
}

const OWNER_CHANGED_MATCH = `type='signal',sender='${DBUS}',interface='${DBUS}',member='NameOwnerChanged',arg0='${KWIN}'`;
const NEW_OWNER = 2;
const LOAD_ATTEMPTS = 2;
const ANNOUNCE_DEADLINE_MS = 3000;

function kwinReturned(message: Message): boolean {
  return (
    message.type === MessageType.SIGNAL &&
    message.member === 'NameOwnerChanged' &&
    message.body[0] === KWIN &&
    message.body[NEW_OWNER] !== ''
  );
}

export class SessionKwin implements KwinPort {
  #bus: KwinBus | null = null;
  #announced = false;
  #onAnnounced: (() => void) | null = null;
  readonly #restarted = new Set<() => void>();
  readonly #events = new Set<(event: KwinEvent) => void>();

  constructor(
    private readonly script: () => Promise<string>,
    private readonly connect: () => KwinBus = sessionBus,
    private readonly deadlineMs: number = ANNOUNCE_DEADLINE_MS,
  ) {}

  onRestart(listener: () => void): void {
    this.#restarted.add(listener);
  }

  onEvent(listener: (event: KwinEvent) => void): void {
    this.#events.add(listener);
  }

  async loaded(): Promise<boolean> {
    const bus = this.#bus;
    if (bus === null || !(await kwinRunning(bus))) {
      return false;
    }
    const answer = await ask(bus, scripting('isScriptLoaded', 's', [KWIN_SCRIPT_NAME]));
    return FLAG.parse(answer)[0];
  }

  async load(): Promise<KwinLoad> {
    const bus = await this.#open();
    if (!(await kwinRunning(bus))) {
      return 'absent';
    }
    const script = await this.script();
    const ids: number[] = [];
    for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
      const id = await this.#start(bus, script);
      ids.push(id);
      if (await this.#answered(bus)) {
        log.info('overlay.kwin_loaded', { id });
        return 'loaded';
      }
    }
    throw new KwinScriptSilentError(
      `KWin loaded the overlay script at ${script} as ${ids.join(' and ')} but it never announced itself.`,
    );
  }

  async unload(): Promise<void> {
    const bus = this.#bus;
    if (bus === null) {
      return;
    }
    this.#bus = null;
    try {
      await unloadBy(bus);
      log.info('overlay.kwin_unloaded');
    } finally {
      bus.disconnect();
    }
  }

  async #start(bus: KwinBus, script: string): Promise<number> {
    await unloadBy(bus);
    this.#announced = false;
    const loaded = await ask(bus, scripting('loadScript', 'ss', [script, KWIN_SCRIPT_NAME]));
    const id = SCRIPT_ID.parse(loaded)[0];
    if (id < 0) {
      throw new KwinRefusedError(`KWin refused the overlay script at ${script}.`);
    }
    await ask(bus, {
      destination: KWIN,
      path: `${SCRIPTING_PATH}/Script${String(id)}`,
      interface: SCRIPT,
      member: 'run',
    });
    return id;
  }

  async #answered(bus: KwinBus): Promise<boolean> {
    await ask(bus, scripting('isScriptLoaded', 's', [KWIN_SCRIPT_NAME]));
    if (this.#announced) {
      return true;
    }
    return new Promise((resolve) => {
      const deadline = setTimeout(() => {
        this.#onAnnounced = null;
        resolve(false);
      }, this.deadlineMs);
      this.#onAnnounced = (): void => {
        clearTimeout(deadline);
        this.#onAnnounced = null;
        resolve(true);
      };
    });
  }

  async #open(): Promise<KwinBus> {
    if (this.#bus === null) {
      const bus = this.connect();
      this.#bus = bus;
      await connected(bus);
      await bus.requestName(READY_NAME, NameFlag.REPLACE_EXISTING);
      await ask(bus, {
        destination: DBUS,
        path: '/org/freedesktop/DBus',
        interface: DBUS,
        member: 'AddMatch',
        signature: 's',
        body: [OWNER_CHANGED_MATCH],
      });
      bus.on('message', (message) => {
        const event = kwinEventOf(message);
        if (event?.kind === 'ready') {
          this.#announced = true;
          this.#onAnnounced?.();
        } else if (event !== null) {
          this.#events.forEach((listener) => {
            listener(event);
          });
        }
        if (kwinReturned(message)) {
          this.#restarted.forEach((listener) => {
            listener();
          });
        }
      });
    }
    return this.#bus;
  }
}
