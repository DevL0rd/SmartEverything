export const SHELLY_VIRTUAL_TYPES = [
  'boolean',
  'number',
  'enum',
  'text',
  'button',
  'group',
] as const;
export type ShellyVirtualType = (typeof SHELLY_VIRTUAL_TYPES)[number];
export const SHELLY_BTHOME_TYPES = ['bthome', 'bthomedevice', 'bthomesensor'] as const;
const VIRTUAL_COMPONENTS: ReadonlySet<string> = new Set<string>(SHELLY_VIRTUAL_TYPES);
const DYNAMIC_COMPONENTS: ReadonlySet<string> = new Set<string>([
  ...SHELLY_VIRTUAL_TYPES,
  ...SHELLY_BTHOME_TYPES,
]);
export function isShellyVirtual(component: string): boolean {
  return VIRTUAL_COMPONENTS.has(component);
}
export function isShellyDynamic(component: string): boolean {
  return DYNAMIC_COMPONENTS.has(component);
}

export const SHELLY_CERTIFICATE_TARGETS = [
  'user_ca',
  'tls_client_cert',
  'tls_client_key',
  'http_server_cert',
  'http_server_key',
  'http_server_ca',
] as const;
export type ShellyCertificateTarget = (typeof SHELLY_CERTIFICATE_TARGETS)[number];
export const SHELLY_CERTIFICATE_METHODS: Readonly<Record<ShellyCertificateTarget, string>> = {
  user_ca: 'Shelly.PutUserCA',
  tls_client_cert: 'Shelly.PutTLSClientCert',
  tls_client_key: 'Shelly.PutTLSClientKey',
  http_server_cert: 'Shelly.PutHTTPServerCert',
  http_server_key: 'Shelly.PutHTTPServerKey',
  http_server_ca: 'Shelly.PutHTTPServerCABundle',
};

export function shellyCertificateTargets(
  methods: readonly string[],
): readonly ShellyCertificateTarget[] {
  const known = new Set(methods.map((method) => method.toLowerCase()));
  return SHELLY_CERTIFICATE_TARGETS.filter((target) =>
    known.has(SHELLY_CERTIFICATE_METHODS[target].toLowerCase()),
  );
}

interface Delays {
  readonly presence_delay?: number | null | undefined;
  readonly absence_delay?: number | null | undefined;
  readonly presence_thr?: number | null | undefined;
  readonly absence_thr?: number | null | undefined;
}

export function shellyZoneDelays<T extends Delays>(zone: T): T {
  return {
    ...zone,
    ...(zone.presence_thr === undefined ? {} : { presence_delay: zone.presence_thr }),
    ...(zone.absence_thr === undefined ? {} : { absence_delay: zone.absence_thr }),
  };
}

export function shellyZoneWrite(
  existing: Delays,
  patch: Delays,
): Readonly<Record<string, unknown>> {
  const { presence_delay, absence_delay, ...rest } = patch;
  const presenceKey = existing.presence_thr === undefined ? 'presence_delay' : 'presence_thr';
  const absenceKey = existing.absence_thr === undefined ? 'absence_delay' : 'absence_thr';
  return {
    ...rest,
    ...(presence_delay === undefined ? {} : { [presenceKey]: presence_delay }),
    ...(absence_delay === undefined ? {} : { [absenceKey]: absence_delay }),
  };
}
