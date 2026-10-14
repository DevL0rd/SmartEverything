import { BlockList, isIP } from 'node:net';
import { powershellQuoted, rulePort, ruleSource, type PortRule } from '@smarteverything/domain';
import { z } from 'zod';
import {
  FIXABLE_UNLESS_DENIED,
  addressIn,
  portIn,
  sourceEdges,
  type OpeningState,
  type Probe,
} from './openings';
import { encodedPowerShell } from './powershell';
import { answerOf, type FirewallSystem } from './system';

function listOf<T extends z.ZodType>(item: T): z.ZodType<z.output<T>[]> {
  return z.preprocess((value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value;
    }
    return value === null || value === undefined ? [] : [value];
  }, z.array(item));
}

const WINDOWS_RULE = z.object({
  action: z.string(),
  profile: z.string(),
  protocol: z.string(),
  localPort: listOf(z.string()),
  remoteAddress: listOf(z.string()),
});

type WindowsRule = z.infer<typeof WINDOWS_RULE>;

const WINDOWS_FIREWALL = z.object({
  profiles: listOf(z.object({ name: z.string(), enabled: z.string(), inbound: z.string() })),
  active: listOf(z.string()),
  rules: listOf(WINDOWS_RULE),
  appRules: listOf(WINDOWS_RULE),
});

type WindowsFirewall = z.infer<typeof WINDOWS_FIREWALL>;

const CATEGORY_PROFILES: Readonly<Record<string, string>> = {
  Public: 'Public',
  Private: 'Private',
  DomainAuthenticated: 'Domain',
};

const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_NETWORKS.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_NETWORKS.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_NETWORKS.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_NETWORKS.addSubnet('fe80::', 10, 'ipv6');

class WindowsFirewallAnswerError extends Error {
  override readonly name = 'WindowsFirewallAnswerError';

  constructor(reason: string) {
    super(`PowerShell must describe the Windows Defender Firewall as JSON; ${reason}.`);
  }
}

function readScript(program: string, appProgram: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$program = ${powershellQuoted(program)}`,
    `$appProgram = ${powershellQuoted(appProgram)}`,
    '$profiles = @(Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ name = [string]$_.Name; enabled = [string]$_.Enabled; inbound = [string]$_.DefaultInboundAction } })',
    '$active = @(Get-NetConnectionProfile | ForEach-Object { [string]$_.NetworkCategory })',
    "function Read-Rules($path) { @(Get-NetFirewallApplicationFilter -Program $path -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' } | ForEach-Object { $ports = $_ | Get-NetFirewallPortFilter; $addresses = $_ | Get-NetFirewallAddressFilter; [pscustomobject]@{ action = [string]$_.Action; profile = [string]$_.Profile; protocol = [string]$ports.Protocol; localPort = @($ports.LocalPort | ForEach-Object { [string]$_ }); remoteAddress = @($addresses.RemoteAddress | ForEach-Object { [string]$_ }) } }) }",
    '[pscustomobject]@{ profiles = $profiles; active = $active; rules = (Read-Rules $program); appRules = (Read-Rules $appProgram) } | ConvertTo-Json -Depth 5 -Compress',
  ].join('\n');
}

function parsed(stdout: string): WindowsFirewall {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch (error) {
    throw new WindowsFirewallAnswerError(
      `it answered text that is not JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const result = WINDOWS_FIREWALL.safeParse(json);
  if (!result.success) {
    throw new WindowsFirewallAnswerError(`the JSON has the wrong shape: ${result.error.message}`);
  }
  return result.data;
}

async function readFirewall(system: FirewallSystem): Promise<WindowsFirewall> {
  return parsed(
    await answerOf(system, 'powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodedPowerShell(readScript(system.go2rtcBinary, system.appBinary)),
    ]),
  );
}

function maskPrefix(mask: string): number {
  return mask
    .split('.')
    .map((part) => Number(part).toString(2))
    .join('')
    .replaceAll('0', '').length;
}

function rangeCovers(entry: string, address: string): boolean {
  const [low = '', high = ''] = entry.split('-');
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
  if (isIP(low) !== isIP(address) || isIP(high) !== isIP(address)) {
    return false;
  }
  const list = new BlockList();
  list.addRange(low, high, family);
  return list.check(address, family);
}

function addressCovers(entry: string, address: string): boolean {
  if (entry === 'Any') {
    return true;
  }
  if (entry === 'LocalSubnet') {
    return PRIVATE_NETWORKS.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
  }
  if (entry.includes('-')) {
    return rangeCovers(entry, address);
  }
  const [network = '', mask] = entry.split('/');
  if (mask === undefined) {
    return addressIn(network, address);
  }
  return addressIn(
    `${network}/${String(mask.includes('.') ? maskPrefix(mask) : Number(mask))}`,
    address,
  );
}

function ruleCovers(rule: WindowsRule, wanted: PortRule): boolean {
  const protocolCovers = rule.protocol === 'Any' || rule.protocol === wanted.protocol.toUpperCase();
  const port = rulePort(wanted);
  const portCovers =
    rule.localPort.includes('Any') ||
    (port !== null &&
      rule.localPort.some((entry) => /^[0-9,-]+$/.test(entry) && portIn(entry, port)));
  const source = ruleSource(wanted);
  const sourceCovers =
    source === null
      ? rule.remoteAddress.includes('Any')
      : rule.remoteAddress.some((entry) =>
          sourceEdges(source).every((edge) => addressCovers(entry, edge)),
        );
  return protocolCovers && portCovers && sourceCovers;
}

function profileCovers(rule: WindowsRule, profile: string): boolean {
  return rule.profile === 'Any' || rule.profile.split(/,\s*/).includes(profile);
}

function filteringProfiles(firewall: WindowsFirewall): readonly string[] {
  const active = new Set(
    firewall.active.map((category) => CATEGORY_PROFILES[category] ?? category),
  );
  return firewall.profiles
    .filter(
      (profile) =>
        active.has(profile.name) && profile.enabled !== 'False' && profile.inbound !== 'Allow',
    )
    .map((profile) => profile.name);
}

function windowsStateOf(firewall: WindowsFirewall, wanted: PortRule): OpeningState {
  const profiles = filteringProfiles(firewall);
  const rules =
    wanted.purpose === 'camera' || wanted.purpose === 'webrtc' ? firewall.rules : firewall.appRules;
  const covering = rules.filter((rule) => ruleCovers(rule, wanted));
  const appliesHere = (rule: WindowsRule): boolean =>
    profiles.some((profile) => profileCovers(rule, profile));
  if (covering.some((rule) => rule.action === 'Block' && appliesHere(rule))) {
    return 'denied';
  }
  const allowed = covering.filter((rule) => rule.action === 'Allow');
  const open = profiles.every((profile) => allowed.some((rule) => profileCovers(rule, profile)));
  return open ? 'open' : 'missing';
}

export async function probeWindows(system: FirewallSystem): Promise<Probe> {
  const firewall = await readFirewall(system);
  const profiles = filteringProfiles(firewall);
  return {
    backend: 'windows',
    filtering: profiles.length > 0,
    detail:
      profiles.length > 0
        ? `Windows Defender Firewall blocks incoming connections on the active ${profiles.join(' and ')} network.`
        : 'Windows Defender Firewall does not block incoming connections on the active network.',
    stateOf: (rule) => windowsStateOf(firewall, rule),
    draft: (needed) => ({
      backend: 'windows',
      program: system.go2rtcBinary,
      appProgram: system.appBinary,
      rules: needed.map((opening) => opening.rule),
    }),
    fixable: FIXABLE_UNLESS_DENIED,
    watch: [],
  };
}
