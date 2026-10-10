import { ruleSource, type PortRule } from '@smarteverything/domain';
import { z } from 'zod';
import { addressIn, portIn, type OpeningState, type Probe } from './openings';
import type { FirewallSystem } from './system';

const UFW_DIRECTORY = '/etc/ufw';
const UFW_CONF = `${UFW_DIRECTORY}/ufw.conf`;
const UFW_DEFAULTS = '/etc/default/ufw';
const RULE_FILES = { ipv4: `${UFW_DIRECTORY}/user.rules`, ipv6: `${UFW_DIRECTORY}/user6.rules` };
const TUPLE_PREFIX = '### tuple ###';
const ANY_NETWORK = new Set(['0.0.0.0/0', '::/0']);

interface UfwTuple {
  readonly verdict: 'allow' | 'deny';
  readonly protocol: string;
  readonly dport: string;
  readonly dst: string;
  readonly sport: string;
  readonly src: string;
  readonly direction: string;
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
  const words = body.split(' ').filter((word) => !word.startsWith('comment='));
  const parsed = TUPLE_WORDS.safeParse(words);
  if (!parsed.success) {
    throw new UfwRulesFormatError(line);
  }
  const tuple: UfwTuple = parsed.data;
  return tuple;
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
  return source === null ? ANY_NETWORK.has(tuple.src) : addressIn(tuple.src, source);
}

function portCovers(tuple: UfwTuple, rule: PortRule): boolean {
  if (tuple.dport === 'any') {
    return true;
  }
  return rule.purpose === 'webrtc' && portIn(tuple.dport, rule.port);
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
): OpeningState {
  const first = tuples.find((tuple) => covers(tuple, rule));
  if (first === undefined) {
    return dropsByDefault ? 'missing' : 'open';
  }
  return first.verdict === 'allow' ? 'open' : 'denied';
}

type Family = keyof typeof RULE_FILES;

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

export async function probeUfw(system: FirewallSystem): Promise<Probe> {
  const policy = valueOf(await requiredText(system, UFW_DEFAULTS), 'DEFAULT_INPUT_POLICY');
  if (policy === null) {
    throw new UfwSettingMissingError(UFW_DEFAULTS, 'DEFAULT_INPUT_POLICY');
  }
  const dropsByDefault = policy !== 'ACCEPT';
  const tuples: Readonly<Record<Family, readonly UfwTuple[]>> = {
    ipv4: await tuplesIn(system, 'ipv4'),
    ipv6: await tuplesIn(system, 'ipv6'),
  };
  return {
    backend: 'ufw',
    filtering: dropsByDefault,
    detail: dropsByDefault
      ? `ufw is active and its default incoming policy is ${policy}, so cameras, pushing devices and phones need allow rules.`
      : 'ufw is active but accepts incoming traffic by default.',
    stateOf: (rule) => ufwStateOf(tuples[familyOf(rule)], rule, dropsByDefault),
    draft: (needed) => ({
      backend: 'ufw',
      rules: needed.map((opening) => ({ rule: opening.rule, prepend: opening.state === 'denied' })),
    }),
    fixable: new Set(['missing', 'unknown', 'denied']),
    watch: [UFW_DIRECTORY],
  };
}
