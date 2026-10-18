import { SHELLY_DEVICE_INFO, type ShellyDiscoveryResult } from '@smarteverything/shelly';
import type { PluginStop } from '../contract';
import { watchShelly } from './discovery';
import { enrolledDevices, type ShellyEnrollment } from './enrollment';
import { readBounded, shellyHttp } from './http';
import type { ShellyContext } from './settings';

const IDENTITY_BYTES = 65536;
type Candidate = ShellyDiscoveryResult['candidates'][number];
interface AddressWatch {
  readonly stopped: () => boolean;
  readonly accept: (enrollment: ShellyEnrollment) => void;
}

export function watchShellyAddresses(
  ctx: ShellyContext,
  accept: (enrollment: ShellyEnrollment) => void,
): PluginStop {
  let stopped = false;
  const pending = new Set<string>();
  const candidates = new Map<string, Candidate>();
  const failed = (cause: unknown): void => {
    ctx.log.warn('shelly.discovery_failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    });
  };
  const observe = (candidate: Candidate): void => {
    const known = enrolledDevices(ctx.records('enrollments')).find(
      (entry) => entry.info.id === candidate.name,
    );
    if (known === undefined || new URL(candidate.address).hostname.startsWith('[')) return;
    candidates.set(known.info.id, candidate);
    if (stopped || ctx.settings.paused || pending.has(known.info.id)) return;
    pending.add(known.info.id);
    updateAddress(ctx, known, candidate, { stopped: () => stopped, accept })
      .catch(failed)
      .finally(() => {
        pending.delete(known.info.id);
        replayNewer(candidate, candidates, observe);
      });
  };
  const settingsStop = ctx.settingsChanged((settings) => {
    if (!settings.paused) for (const candidate of candidates.values()) observe(candidate);
  });
  const stopObserver = watchShelly(observe, failed);
  return async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    settingsStop();
    await stopObserver();
  };
}

async function updateAddress(
  ctx: ShellyContext,
  known: ShellyEnrollment,
  candidate: Candidate,
  watch: AddressWatch,
): Promise<void> {
  const oldUrl = new URL(known.address);
  const newUrl = new URL(candidate.address);
  if (oldUrl.protocol !== 'http:') return;
  if (oldUrl.origin === newUrl.origin) return;
  const response = await shellyHttp(new URL('/shelly', newUrl), { signal: ctx.signal, tls: null });
  if (!response.ok) throw new Error('Shelly address verification did not return HTTP success.');
  const info = SHELLY_DEVICE_INFO.parse(JSON.parse(await readBounded(response, IDENTITY_BYTES)));
  verifyIdentity(known, info);
  const records = ctx.records('enrollments');
  const latest = enrolledDevices(records).find((entry) => entry.info.id === known.info.id);
  if (
    watch.stopped() ||
    ctx.signal.aborted ||
    ctx.settings.paused ||
    latest?.address !== known.address
  )
    return;
  watch.accept({ ...latest, address: newUrl.origin, info });
  ctx.log.info('shelly.address_changed', {});
}

function verifyIdentity(known: ShellyEnrollment, info: ShellyEnrollment['info']): void {
  if (info.id !== known.info.id || info.model !== known.info.model || info.gen !== known.info.gen)
    throw new Error('Shelly advertisement identity differs from the enrolled sensor.');
}

function replayNewer(
  previous: Candidate,
  candidates: ReadonlyMap<string, Candidate>,
  observe: (candidate: Candidate) => void,
): void {
  const latest = candidates.get(previous.name);
  if (latest !== undefined && latest.address !== previous.address) observe(latest);
}
