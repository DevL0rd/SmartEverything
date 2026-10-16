import { SHELLY_DEVICE_INFO, type ShellyDiscoveryResult } from '@smarteverything/domain';
import type { PluginContext, PluginStop } from '../contract';
import { watchShelly } from './discovery';
import { enrolledDevices, saveEnrollment, type ShellyEnrollment } from './enrollment';
import { boundedText } from './http';
import type { ShellySettings } from './settings';

type Candidate = ShellyDiscoveryResult['candidates'][number];
interface AddressWatch {
  readonly stopped: () => boolean;
  readonly accept: (enrollment: ShellyEnrollment) => void;
}

export function watchShellyAddresses(
  ctx: PluginContext<ShellySettings>,
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
  const observer = watchShelly(observe, failed).catch((cause: unknown) => {
    failed(cause);
    return (): Promise<void> => Promise.resolve();
  });
  return async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    settingsStop();
    const stop = await observer;
    await stop();
  };
}

async function updateAddress(
  ctx: PluginContext<ShellySettings>,
  known: ShellyEnrollment,
  candidate: Candidate,
  watch: AddressWatch,
): Promise<void> {
  const oldUrl = new URL(known.address);
  const newUrl = new URL(candidate.address);
  if (oldUrl.protocol !== 'http:') return;
  if (oldUrl.origin === newUrl.origin) return;
  const response = await fetch(new URL('/shelly', newUrl), {
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(10000)]),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Shelly address verification did not return HTTP success.');
  const info = SHELLY_DEVICE_INFO.parse(JSON.parse(await boundedText(response)));
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
  const enrollment = { ...latest, address: newUrl.origin, info };
  saveEnrollment(records, enrollment);
  watch.accept(enrollment);
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
