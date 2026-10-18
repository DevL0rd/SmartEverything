import { NATIVE_HUB_CAPABILITIES, type NativeHubCapabilities } from '@smarteverything/domain';

const HUB_CAPABILITIES_ARGUMENT_PREFIX = '--smarteverything-hub-capabilities=';

export function hubCapabilities(authority: boolean, resources: boolean): NativeHubCapabilities {
  return {
    http: true,
    websocket: true,
    media: false,
    routeAuthority: authority,
    background: authority,
    image: resources,
    httpMedia: resources,
    mse: false,
    html: false,
    download: resources,
    pairingInspection: true,
  };
}

export function hubCapabilitiesArgument(capabilities: NativeHubCapabilities): string {
  return `${HUB_CAPABILITIES_ARGUMENT_PREFIX}${JSON.stringify(capabilities)}`;
}

export function readHubCapabilities(argv: readonly string[]): NativeHubCapabilities {
  const argument = argv.find((candidate) => candidate.startsWith(HUB_CAPABILITIES_ARGUMENT_PREFIX));
  if (argument === undefined)
    throw new Error(
      `the main process passes ${HUB_CAPABILITIES_ARGUMENT_PREFIX}<json>; none found`,
    );
  return NATIVE_HUB_CAPABILITIES.parse(
    JSON.parse(argument.slice(HUB_CAPABILITIES_ARGUMENT_PREFIX.length)),
  );
}
