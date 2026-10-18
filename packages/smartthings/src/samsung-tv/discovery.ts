import { MAC_ADDRESS } from '@smarteverything/domain';
import type { TvInfo } from './power';

export const SSDP_ADDRESS = '239.255.255.250';

export const SSDP_PORT = 1900;

export const SSDP_TARGET = 'urn:samsung.com:device:RemoteControlReceiver:1';

export const SSDP_WAIT_SECONDS = 2;

const MODEL_REGION_PREFIX = 2;

const MODEL_REGION_SUFFIX = 9;

export interface TvCandidate {
  readonly host: string;
  readonly name: string;
  readonly model: string | null;
  readonly macAddress: string | null;
  readonly likely: boolean;
}

export function ssdpSearchMessage(): string {
  return [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDRESS}:${String(SSDP_PORT)}`,
    'MAN: "ssdp:discover"',
    `MX: ${String(SSDP_WAIT_SECONDS)}`,
    `ST: ${SSDP_TARGET}`,
    '',
    '',
  ].join('\r\n');
}

function headersOf(text: string): ReadonlyMap<string, string> {
  const headers = new Map<string, string>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }
  return headers;
}

function hostOf(location: string | undefined, from: string): string {
  return location !== undefined && URL.canParse(location) ? new URL(location).hostname : from;
}

export function readSsdpAnswer(text: string, from: string): string | null {
  if (!text.startsWith('HTTP/1.1 200')) {
    return null;
  }
  const headers = headersOf(text);
  return headers.get('st')?.toLowerCase() === SSDP_TARGET.toLowerCase()
    ? hostOf(headers.get('location'), from)
    : null;
}

export function readSsdpAnnouncement(text: string, from: string): string | null {
  if (!text.startsWith('NOTIFY ')) {
    return null;
  }
  const headers = headersOf(text);
  const subtype = headers.get('nts')?.toLowerCase();
  const announced = subtype === 'ssdp:alive' || subtype === 'ssdp:update';
  return announced && headers.get('nt')?.toLowerCase() === SSDP_TARGET.toLowerCase()
    ? hostOf(headers.get('location'), from)
    : null;
}

function modelCore(model: string): string {
  return model.slice(MODEL_REGION_PREFIX, MODEL_REGION_SUFFIX).toLowerCase();
}

export function candidateOf(host: string, info: TvInfo, deviceModel: string): TvCandidate {
  const mac = info.wifiMac === null ? null : MAC_ADDRESS.safeParse(info.wifiMac);
  return {
    host,
    name: info.name ?? info.model ?? host,
    model: info.model,
    macAddress: mac?.success === true ? mac.data : null,
    likely: info.model !== null && modelCore(info.model) === modelCore(deviceModel),
  };
}
