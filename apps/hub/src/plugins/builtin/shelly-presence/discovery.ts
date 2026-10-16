import { SHELLY_DISCOVERY_RESULT, type ShellyDiscoveryResult } from '@smarteverything/domain';
import { z } from 'zod';
import { SessionBus, type BusCall } from '../../../node/controls/linux/dbus-session';
type Candidate = ShellyDiscoveryResult['candidates'][number];
const DESTINATION = 'org.freedesktop.Avahi';
const ITEM = z.tuple([
  z.int(),
  z.int(),
  z.string().max(100),
  z.literal('_shelly._tcp'),
  z.string().max(100),
  z.int(),
]);
const RESOLVED = z.tuple([
  z.int(),
  z.int(),
  z.string(),
  z.string(),
  z.string(),
  z.string().max(300),
  z.int(),
  z.string().max(100),
  z.int().min(1).max(65535),
  z.array(z.instanceof(Buffer)).max(128),
  z.int(),
]);
export async function discoverShelly(signal: AbortSignal): Promise<ShellyDiscoveryResult> {
  if (process.platform !== 'linux')
    return {
      available: false,
      reason: 'Local discovery requires the Linux Avahi service; add a sensor by address.',
      candidates: [],
    };
  const bus = SessionBus.system();
  const candidates = new Map<string, ShellyDiscoveryResult['candidates'][number]>();
  const pending = new Set<Promise<void>>();
  let unwatch: () => void = () => undefined;
  let path: string | null = null;
  try {
    const browser = await prepareBrowser(bus, candidates, pending, () => undefined);
    path = browser.path;
    unwatch = browser.unwatch;
    await discoveryWindow(signal, bus);
    await Promise.all(pending);
    return SHELLY_DISCOVERY_RESULT.parse({
      available: true,
      reason: null,
      candidates: [...candidates.values()],
    });
  } catch (cause) {
    return {
      available: false,
      reason:
        cause instanceof Error
          ? `Local discovery unavailable (${cause.name}); add a sensor by address.`
          : 'Local discovery unavailable; add a sensor by address.',
      candidates: [],
    };
  } finally {
    unwatch();
    if (path !== null)
      await deadline(
        bus.call({
          destination: DESTINATION,
          path,
          iface: 'org.freedesktop.Avahi.ServiceBrowser',
          member: 'Free',
        }),
      ).catch(() => undefined);
    bus.close();
  }
}
async function prepareBrowser(
  bus: SessionBus,
  candidates: Map<string, ShellyDiscoveryResult['candidates'][number]>,
  pending: Set<Promise<void>>,
  observed: (candidate: Candidate) => void,
): Promise<{ path: string; unwatch: () => void }> {
  const prepared = await deadline(
    bus.call({
      destination: DESTINATION,
      path: '/',
      iface: 'org.freedesktop.Avahi.Server2',
      member: 'ServiceBrowserPrepare',
      signature: 'iissu',
      body: [-1, -1, '_shelly._tcp', 'local', 0],
    }),
  );
  const path = z.tuple([z.string().regex(/^\//)]).parse(prepared)[0];
  const unwatch = await bus.watch(
    { sender: DESTINATION, path, iface: 'org.freedesktop.Avahi.ServiceBrowser', member: 'ItemNew' },
    (body) => {
      const parsed = ITEM.safeParse(body);
      if (!parsed.success || pending.size >= 16 || candidates.size >= 64) return;
      const work = resolve(bus, parsed.data)
        .then((candidate) => {
          candidates.set(candidate.address, candidate);
          observed(candidate);
        })
        .catch(() => undefined)
        .finally(() => {
          pending.delete(work);
        });
      pending.add(work);
    },
  );
  await deadline(
    bus.call({
      destination: DESTINATION,
      path,
      iface: 'org.freedesktop.Avahi.ServiceBrowser',
      member: 'Start',
    }),
  );
  return { path, unwatch };
}
async function resolve(
  bus: SessionBus,
  item: z.output<typeof ITEM>,
): Promise<ShellyDiscoveryResult['candidates'][number]> {
  const [network, protocol, name, type, domain] = item;
  const call: BusCall = {
    destination: DESTINATION,
    path: '/',
    iface: 'org.freedesktop.Avahi.Server',
    member: 'ResolveService',
    signature: 'iisssiu',
    body: [network, protocol, name, type, domain, -1, 0],
  };
  const result = RESOLVED.parse(await deadline(bus.call(call)));
  const txt = result[9].map((bytes) => bytes.toString('utf8'));
  const generation = txt.find((value) => value.startsWith('gen='))?.slice(4) ?? null;
  const address = result[7].includes(':') ? `[${result[7]}]` : result[7];
  return {
    name: result[2],
    host: result[5],
    address: `http://${address}:${String(result[8])}`,
    generation,
  };
}
function discoveryWindow(signal: AbortSignal, bus: SessionBus): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = (): void => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 8000);
    timer.unref();
    signal.addEventListener('abort', abort, { once: true });
    bus.onError((cause) => {
      cleanup();
      reject(cause instanceof Error ? cause : new ShellyDiscoveryTimeoutError());
    });
    if (signal.aborted) abort();
  });
}
async function deadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ShellyDiscoveryTimeoutError());
        }, 3000);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
class ShellyDiscoveryTimeoutError extends Error {
  override readonly name = 'ShellyDiscoveryTimeoutError';
  constructor() {
    super('The discovery service did not respond in time.');
  }
}

export async function watchShelly(
  observed: (candidate: Candidate) => void,
  failed: (cause: unknown) => void,
): Promise<() => Promise<void>> {
  if (process.platform !== 'linux') return () => Promise.resolve();
  const bus = SessionBus.system();
  bus.onError(failed);
  try {
    const candidates = new Map<string, Candidate>();
    const browser = await prepareBrowser(bus, candidates, new Set(), (candidate) => {
      candidates.clear();
      observed(candidate);
    });
    return async (): Promise<void> => {
      browser.unwatch();
      try {
        await deadline(
          bus.call({
            destination: DESTINATION,
            path: browser.path,
            iface: 'org.freedesktop.Avahi.ServiceBrowser',
            member: 'Free',
          }),
        );
      } finally {
        bus.close();
      }
    };
  } catch (cause) {
    bus.close();
    throw cause;
  }
}
