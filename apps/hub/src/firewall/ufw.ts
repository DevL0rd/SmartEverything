import { isIP } from 'node:net';
import {
  FIREWALL_GROUP,
  UFW_ADDRESS_RULE_COMMENTS,
  UFW_RULE_FILES,
  isDeviceRule,
  rulePort,
  ruleSource,
  type PortRule,
  type UfwStaleRule,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  addressIn,
  always,
  portIn,
  sourceEdges,
  type DraftInput,
  type OpeningState,
  type PlanDraft,
  type Probe,
} from './openings';
import { entryKey, entryOf, macOpenings, managedEntries, type MacFiles } from './ufw-mac';
import { errorCode, type FirewallSystem } from './system';

const UFW_DIRECTORY = '/etc/ufw';
const UFW_CONF = `${UFW_DIRECTORY}/ufw.conf`;
const UFW_DEFAULTS = '/etc/default/ufw';
const RULE_FILES = { ipv4: `${UFW_DIRECTORY}/user.rules`, ipv6: `${UFW_DIRECTORY}/user6.rules` };
const [AFTER_IPV4, AFTER_IPV6] = UFW_RULE_FILES;
const AFTER_FILES = { ipv4: AFTER_IPV4.path, ipv6: AFTER_IPV6.path };
const TUPLE_PREFIX = '### tuple ###';
const COMMENT_PREFIX = 'comment=';
const ANY_NETWORK = new Set(['0.0.0.0/0', '::/0']);

interface UfwTuple {
  readonly verdict: 'allow' | 'deny';
  readonly protocol: string;
  readonly dport: string;
  readonly dst: string;
  readonly sport: string;
  readonly src: string;
  readonly direction: string;
  readonly comment: string | null;
}

class UfwRulesFormatError extends Error {
  override readonly name = 'UfwRulesFormatError';

  constructor(line: string) {
    super(
      `A ufw rule tuple must hold an action, protocol, ports, addresses and a direction; received "${line}".`,
    );
  }
}

class UfwSettingMissingError extends Error {
  override readonly name = 'UfwSettingMissingError';

  constructor(file: string, setting: string) {
    super(`ufw is enabled, so ${file} must exist and hold ${setting}; it does not.`);
  }
}

async function requiredText(system: FirewallSystem, file: string): Promise<string> {
  const text = await system.read(file);
  if (text === null) {
    throw new UfwSettingMissingError(file, 'its rules');
  }
  return text;
}

const WORD = z.string().min(1);

const ADDRESSING = [WORD, WORD, WORD, WORD, WORD, WORD] as const;

const TUPLE_WORDS = z.union([
  z
    .tuple([...ADDRESSING, WORD])
    .transform(([action, protocol, dport, dst, sport, src, direction]) => ({
      verdict: verdictOf(action),
      protocol,
      dport,
      dst,
      sport,
      src,
      direction,
    })),
  z
    .tuple([...ADDRESSING, WORD, WORD, WORD])
    .transform(([action, protocol, dport, dst, sport, src, , , direction]) => ({
      verdict: verdictOf(action),
      protocol,
      dport,
      dst,
      sport,
      src,
      direction,
    })),
]);

function valueOf(text: string, key: string): string | null {
  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}=`));
  return line === undefined ? null : line.slice(key.length + 1).replace(/^"|"$/g, '');
}

function verdictOf(action: string): 'allow' | 'deny' {
  const base = action.split('_')[0];
  return base === 'allow' || base === 'limit' ? 'allow' : 'deny';
}

function tupleOf(line: string): UfwTuple | null {
  const body = line.slice(TUPLE_PREFIX.length).trim();
  if (body.startsWith('route:')) {
    return null;
  }
  const all = body.split(' ');
  const parsed = TUPLE_WORDS.safeParse(all.filter((word) => !word.startsWith(COMMENT_PREFIX)));
  if (!parsed.success) {
    throw new UfwRulesFormatError(line);
  }
  const hex = all.find((word) => word.startsWith(COMMENT_PREFIX))?.slice(COMMENT_PREFIX.length);
  return {
    ...parsed.data,
    comment: hex === undefined ? null : Buffer.from(hex, 'hex').toString('utf8'),
  };
}

function ufwTuples(text: string): readonly UfwTuple[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith(TUPLE_PREFIX))
    .flatMap((line) => {
      const tuple = tupleOf(line);
      return tuple === null ? [] : [tuple];
    });
}

function sourceCovers(tuple: UfwTuple, rule: PortRule): boolean {
  const source = ruleSource(rule);
  return source === null
    ? ANY_NETWORK.has(tuple.src)
    : sourceEdges(source).every((edge) => addressIn(tuple.src, edge));
}

function portCovers(tuple: UfwTuple, rule: PortRule): boolean {
  if (tuple.dport === 'any') {
    return true;
  }
  const port = rulePort(rule);
  return port !== null && portIn(tuple.dport, port);
}

function protocolCovers(tuple: UfwTuple, rule: PortRule): boolean {
  return tuple.protocol === 'any' || tuple.protocol === rule.protocol;
}

function covers(tuple: UfwTuple, rule: PortRule): boolean {
  return (
    tuple.direction === 'in' &&
    ANY_NETWORK.has(tuple.dst) &&
    tuple.sport === 'any' &&
    protocolCovers(tuple, rule) &&
    portCovers(tuple, rule) &&
    sourceCovers(tuple, rule)
  );
}

function ufwStateOf(
  tuples: readonly UfwTuple[],
  rule: PortRule,
  dropsByDefault: boolean,
  macs: ReadonlySet<string>,
): OpeningState {
  if (isDeviceRule(rule)) {
    return !dropsByDefault || macs.has(entryKey(entryOf(rule))) ? 'open' : 'missing';
  }
  const first = tuples.find((tuple) => covers(tuple, rule));
  if (first === undefined) {
    return dropsByDefault ? 'missing' : 'open';
  }
  return first.verdict === 'allow' ? 'open' : 'denied';
}

type Family = keyof typeof RULE_FILES;

function legacyAddressesOf(tuples: readonly UfwTuple[]): readonly string[] {
  return tuples.flatMap((tuple) =>
    tuple.verdict === 'allow' &&
    tuple.protocol === 'udp' &&
    tuple.dport === 'any' &&
    tuple.direction === 'in' &&
    isIP(tuple.src) !== 0 &&
    tuple.comment !== null &&
    UFW_ADDRESS_RULE_COMMENTS.includes(tuple.comment)
      ? [tuple.src]
      : [],
  );
}

function isPlainAllow(tuple: UfwTuple): boolean {
  return tuple.verdict === 'allow' && tuple.direction === 'in' && ANY_NETWORK.has(tuple.dst);
}

function ownedBoundAllow(tuple: UfwTuple, iface: string | null): boolean {
  const bound = !ANY_NETWORK.has(tuple.dst) || iface !== null;
  return (
    tuple.verdict === 'allow' &&
    bound &&
    tuple.src.includes('/') &&
    tuple.comment?.startsWith(FIREWALL_GROUP) === true
  );
}

function duplicateRulesOf(tuples: readonly UfwTuple[]): readonly UfwStaleRule[] {
  const plain = new Set(
    tuples.filter(isPlainAllow).map((tuple) => `${tuple.protocol}:${tuple.dport}:${tuple.src}`),
  );
  return tuples.flatMap((tuple) => {
    const port = Number(tuple.dport);
    const protocol = tuple.protocol;
    const [direction, iface = null] = tuple.direction.split('_');
    return direction === 'in' &&
      ownedBoundAllow(tuple, iface) &&
      (protocol === 'tcp' || protocol === 'udp') &&
      Number.isInteger(port) &&
      plain.has(`${protocol}:${tuple.dport}:${tuple.src}`)
      ? [
          {
            protocol,
            port,
            source: tuple.src,
            destination: ANY_NETWORK.has(tuple.dst) ? ('any' as const) : tuple.dst,
            interface: iface,
          },
        ]
      : [];
  });
}

function familyOf(rule: PortRule): Family {
  return ruleSource(rule)?.includes(':') === true ? 'ipv6' : 'ipv4';
}

async function tuplesIn(system: FirewallSystem, family: Family): Promise<readonly UfwTuple[]> {
  return ufwTuples(await requiredText(system, RULE_FILES[family]));
}

export async function ufwEnabled(system: FirewallSystem): Promise<boolean> {
  const conf = await system.read(UFW_CONF);
  return conf !== null && valueOf(conf, 'ENABLED') === 'yes';
}

async function readableProbe(system: FirewallSystem): Promise<Probe> {
  const policy = valueOf(await requiredText(system, UFW_DEFAULTS), 'DEFAULT_INPUT_POLICY');
  if (policy === null) {
    throw new UfwSettingMissingError(UFW_DEFAULTS, 'DEFAULT_INPUT_POLICY');
  }
  const dropsByDefault = policy !== 'ACCEPT';
  const tuples: Readonly<Record<Family, readonly UfwTuple[]>> = {
    ipv4: await tuplesIn(system, 'ipv4'),
    ipv6: await tuplesIn(system, 'ipv6'),
  };
  const files: MacFiles = {
    ipv4: await requiredText(system, AFTER_FILES.ipv4),
    ipv6: await requiredText(system, AFTER_FILES.ipv6),
  };
  const macs = managedEntries(files.ipv4);
  const legacy = {
    addresses: [...legacyAddressesOf(tuples.ipv4), ...legacyAddressesOf(tuples.ipv6)],
    rules: [...duplicateRulesOf(tuples.ipv4), ...duplicateRulesOf(tuples.ipv6)],
  };
  return {
    backend: 'ufw',
    filtering: dropsByDefault,
    detail: dropsByDefault
      ? `ufw is active and its default incoming policy is ${policy}, so cameras, pushing devices, plugins and phones need allow rules. Cameras and pushing devices are allowed by MAC address.`
      : 'ufw is active but accepts incoming traffic by default.',
    stateOf: (rule) => ufwStateOf(tuples[familyOf(rule)], rule, dropsByDefault, macs),
    draft: (input) => ufwDraft(input, dropsByDefault, files, legacy),
    fixable: new Set(['missing', 'unknown', 'denied']),
    watch: [UFW_DIRECTORY],
  };
}

function ufwDraft(
  { needed, openings, unlearned }: DraftInput,
  dropsByDefault: boolean,
  files: MacFiles,
  legacy: Parameters<typeof macOpenings>[3],
): PlanDraft | null {
  const rules = needed.flatMap((opening) =>
    isDeviceRule(opening.rule) ? [] : [{ rule: opening.rule, prepend: opening.state === 'denied' }],
  );
  const mac = dropsByDefault ? macOpenings(openings, unlearned, files, legacy) : null;
  return rules.length === 0 && mac === null
    ? null
    : { backend: 'ufw', rules, mac, unprivilegedPortStart: null };
}

function rootOnlyProbe(): Probe {
  return {
    backend: 'ufw',
    filtering: null,
    detail:
      'ufw is active, but only root can read its rules, so SmartEverything cannot tell which openings exist. Allow the openings below in ufw if they are not open yet.',
    stateOf: always('unknown'),
    draft: null,
    fixable: new Set(),
    watch: [UFW_DIRECTORY],
  };
}

export async function probeUfw(system: FirewallSystem): Promise<Probe> {
  try {
    return await readableProbe(system);
  } catch (cause) {
    if (errorCode(cause) === 'EACCES') {
      return rootOnlyProbe();
    }
    throw cause;
  }
}
