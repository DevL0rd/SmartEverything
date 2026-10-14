import { Message, MessageType, systemBus, type MessageBus } from '@jellybrick/dbus-next';
import { z } from 'zod';
import { HUB_DISCOVERY_CANDIDATE, type HubDiscoveryCandidate } from '@smarteverything/domain';
interface AvahiCall {
  readonly destination: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
  readonly signature: string;
  readonly body: readonly unknown[];
}
const DESTINATION = 'org.freedesktop.Avahi';
const ITEM = z.tuple([
  z.int(),
  z.int(),
  z.string().max(63),
  z.literal('_smarteverything._tcp'),
  z.string().max(100),
  z.int(),
]);
const RESOLVED = z.tuple([
  z.int(),
  z.int(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.int(),
  z.string().max(100),
  z.int().min(1).max(65535),
  z.array(z.instanceof(Buffer)).max(128),
  z.int(),
]);
export class AvahiDiscovery {
  readonly #bus: MessageBus = systemBus();
  #path: string | undefined;
  #stopped = false;
  #pending = 0;
  #incarnation = 0;
  readonly #visible = new Map<string, number>();
  readonly #queued = new Map<
    string,
    { readonly item: z.infer<typeof ITEM>; readonly incarnation: number }
  >();
  readonly #receive: (message: Message) => void;
  constructor(
    readonly changed: (key: string, candidate: HubDiscoveryCandidate | null) => void,
    readonly failed: (cause: unknown) => void,
  ) {
    this.#receive = (message): void => {
      if (
        message.type !== MessageType.SIGNAL ||
        message.path !== this.#path ||
        message.interface !== `${DESTINATION}.ServiceBrowser`
      )
        return;
      if (message.member === 'Failure') {
        this.failed(new Error('Avahi browser failed'));
        return;
      }
      const item = ITEM.safeParse(message.body);
      if (!item.success || this.#stopped) return;
      const key = item.data.slice(0, 5).join('|');
      if (message.member === 'ItemRemove') {
        this.#visible.delete(key);
        this.#queued.delete(key);
        this.changed(key, null);
      }
      if (message.member === 'ItemNew') this.#found(key, item.data);
    };
    this.#bus.on('error', failed);
    this.#bus.on('message', this.#receive);
  }
  async start(): Promise<void> {
    const rule = `type='signal',sender='${DESTINATION}',interface='${DESTINATION}.ServiceBrowser'`;
    await this.#call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'AddMatch',
      signature: 's',
      body: [rule],
    });
    const prepared = await this.#call({
      destination: DESTINATION,
      path: '/',
      interface: `${DESTINATION}.Server2`,
      member: 'ServiceBrowserPrepare',
      signature: 'iissu',
      body: [-1, -1, '_smarteverything._tcp', 'local', 0],
    });
    this.#path = z.tuple([z.string().startsWith('/')]).parse(prepared)[0];
    if (this.#stopped) return;
    await this.#call({
      destination: DESTINATION,
      path: this.#path,
      interface: `${DESTINATION}.ServiceBrowser`,
      member: 'Start',
      signature: '',
      body: [],
    });
  }
  stop(): void {
    this.#stopped = true;
    this.#visible.clear();
    this.#queued.clear();
    this.#bus.removeListener('message', this.#receive);
    this.#bus.disconnect();
  }
  #found(key: string, item: z.infer<typeof ITEM>): void {
    if (!this.#visible.has(key) && this.#visible.size >= 64) return;
    const incarnation = ++this.#incarnation;
    this.#visible.set(key, incarnation);
    this.#queued.set(key, { item, incarnation });
    this.#drain();
  }
  #resolve(item: z.infer<typeof ITEM>, key: string, incarnation: number): void {
    this.#pending += 1;
    const [network, protocol, name, type, domain] = item;
    void this.#call({
      destination: DESTINATION,
      path: '/',
      interface: `${DESTINATION}.Server`,
      member: 'ResolveService',
      signature: 'iisssiu',
      body: [network, protocol, name, type, domain, -1, 0],
    })
      .then((body) => {
        if (this.#stopped || this.#visible.get(key) !== incarnation) return;
        const candidate = this.#candidate(body);
        if (candidate !== null) this.changed(key, candidate);
      })
      .catch((cause: unknown) => {
        if (!this.#stopped && this.#visible.get(key) === incarnation) this.failed(cause);
      })
      .finally(() => {
        this.#pending -= 1;
        this.#drain();
      });
  }
  #drain(): void {
    if (this.#stopped) return;
    for (const [key, entry] of this.#queued) {
      if (this.#pending >= 16) return;
      this.#queued.delete(key);
      if (this.#visible.get(key) === entry.incarnation)
        this.#resolve(entry.item, key, entry.incarnation);
    }
  }
  #candidate(body: readonly unknown[]): HubDiscoveryCandidate | null {
    const result = RESOLVED.parse(body);
    const txt = result[9].map((bytes) => bytes.toString('utf8'));
    const id = txt.find((entry) => entry.startsWith('id='));
    if (
      !txt.includes('protocol=1') ||
      !txt.includes('tls=1') ||
      id === undefined ||
      result[7].includes('%')
    )
      return null;
    const address = result[7].includes(':') ? `[${result[7]}]` : result[7];
    return HUB_DISCOVERY_CANDIDATE.parse({
      name: result[2],
      url: `https://${address}:${String(result[8])}`,
      hubId: id.slice(3),
      protocolVersion: 1,
    });
  }
  async #call(input: AvahiCall): Promise<readonly unknown[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await Promise.race([
        this.#bus.call(new Message({ ...input, body: [...input.body] })),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Avahi ${input.member} timed out`));
          }, 3000);
          timer.unref();
        }),
      ]);
      return z.array(z.unknown()).parse(reply?.body);
    } finally {
      clearTimeout(timer);
    }
  }
}
