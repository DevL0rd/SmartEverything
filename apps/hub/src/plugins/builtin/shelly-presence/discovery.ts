import { SHELLY_DISCOVERY_RESULT, type ShellyDiscoveryResult } from '@smarteverything/shelly';
import { openMdns, watchServices, type FoundService, type OpenMdns } from '../../../network/mdns';
type Candidate = ShellyDiscoveryResult['candidates'][number];
const SERVICE_TYPE = 'shelly';
const SCAN_WINDOW_MS = 8000;

function candidateOf(service: FoundService): Candidate {
  const address = service.address.includes(':') ? `[${service.address}]` : service.address;
  return {
    name: service.name,
    host: service.host,
    address: `http://${address}:${String(service.port)}`,
    generation: service.txt.get('gen') ?? null,
  };
}

function scanWindow(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, SCAN_WINDOW_MS);
    timer.unref();
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function discoverShelly(
  signal: AbortSignal,
  open: OpenMdns = openMdns,
): Promise<ShellyDiscoveryResult> {
  let fail: (cause: Error) => void = () => undefined;
  const failed = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  const mdns = open((cause) => {
    fail(cause instanceof Error ? cause : new Error(String(cause)));
  });
  const candidates = new Map<string, Candidate>();
  const watch = watchServices(mdns, SERVICE_TYPE, {
    found: (service) => candidates.set(service.name.toLowerCase(), candidateOf(service)),
  });
  try {
    await Promise.race([scanWindow(signal), failed]);
    return SHELLY_DISCOVERY_RESULT.parse({
      available: true,
      reason: null,
      candidates: [...candidates.values()],
    });
  } catch (cause) {
    return {
      available: false,
      reason: `Local discovery unavailable (${cause instanceof Error ? cause.name : 'unknown'}); add a sensor by address.`,
      candidates: [],
    };
  } finally {
    watch.stop();
    await mdns.close();
  }
}

export function watchShelly(
  observed: (candidate: Candidate) => void,
  failed: (cause: unknown) => void,
  open: OpenMdns = openMdns,
): () => Promise<void> {
  const mdns = open(failed);
  const watch = watchServices(mdns, SERVICE_TYPE, {
    found: (service) => {
      observed(candidateOf(service));
    },
  });
  return async (): Promise<void> => {
    watch.stop();
    await mdns.close();
  };
}
