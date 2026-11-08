import { z } from 'zod';
import { DEVICE_FAMILIES, type DeviceFamily } from '../presentation/types';

const STRINGS = z.array(z.string().min(1)).default([]);

const MODEL_MATCH_FIELDS = {
  exact: STRINGS,
  prefix: STRINGS,
  normalised: STRINGS,
  product: STRINGS,
  hardwareModel: STRINGS,
  families: z.array(z.enum(DEVICE_FAMILIES)).default([]),
};

function hasEntry(match: Readonly<Record<string, readonly unknown[]>>): boolean {
  return Object.values(match).some((entries) => entries.length > 0);
}

export const MODEL_MATCH = z.strictObject(MODEL_MATCH_FIELDS).refine(hasEntry, {
  message: 'a match needs at least one entry',
});

export const MODEL_MATCH_READ = z.object(MODEL_MATCH_FIELDS);

export type ModelMatch = z.output<typeof MODEL_MATCH_READ>;

export interface ModelSubject {
  readonly brand: string;
  readonly manufacturer?: string | undefined;
  readonly model: string;
  readonly family: DeviceFamily;
  readonly hardwareModel?: string | undefined;
  readonly product?: string | undefined;
}

export const MATCH_TIERS = ['hardware', 'exact', 'prefix', 'normalised'] as const;

export type MatchTier = (typeof MATCH_TIERS)[number];

export interface MatchScore {
  readonly tier: MatchTier;
  readonly length: number;
}

const TIER_RANK: Readonly<Record<MatchTier, number>> = {
  hardware: 4,
  exact: 3,
  prefix: 2,
  normalised: 1,
};

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isVersionToken(token: string): boolean {
  const body = token.startsWith('v') ? token.slice(1) : token;
  if (body.length === 0 || !isDigit(body.charAt(0)) || !isDigit(body.charAt(body.length - 1))) {
    return false;
  }
  for (const char of body) {
    if (char !== '.' && !isDigit(char)) return false;
  }
  return token.startsWith('v') || body.includes('.');
}

function trimTrailingNonAscii(text: string): string {
  let end = text.length;
  while (end > 0) {
    const code = text.charCodeAt(end - 1);
    if (code <= 127 && code > 32) break;
    end -= 1;
  }
  return text.slice(0, end);
}

function dropTrailingVersion(text: string): string {
  const split = text.lastIndexOf(' ');
  if (split < 0 || !isVersionToken(text.slice(split + 1))) return text;
  return text.slice(0, split);
}

export function normaliseModelString(model: string): string {
  const bar = model.indexOf('|');
  const head = (bar < 0 ? model : model.slice(0, bar)).toLowerCase();
  return trimTrailingNonAscii(dropTrailingVersion(trimTrailingNonAscii(head))).trim();
}

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function compareScores(left: MatchScore, right: MatchScore): number {
  return TIER_RANK[left.tier] - TIER_RANK[right.tier] || left.length - right.length;
}

function listed(entries: readonly string[], value: string | undefined): number {
  return value !== undefined && entries.includes(value) ? value.length : -1;
}

function hardwareScore(match: ModelMatch, subject: ModelSubject): MatchScore | null {
  const length = Math.max(
    listed(match.hardwareModel, subject.hardwareModel),
    listed(match.product, subject.product),
  );
  return length < 0 ? null : { tier: 'hardware', length };
}

function prefixScore(match: ModelMatch, model: string): MatchScore | null {
  let best = -1;
  for (const prefix of match.prefix) {
    if (model.startsWith(prefix) && prefix.length > best) best = prefix.length;
  }
  return best < 0 ? null : { tier: 'prefix', length: best };
}

function normalisedScore(match: ModelMatch, model: string): MatchScore | null {
  const wanted = normaliseModelString(model);
  const hit = match.normalised.some((entry) => normaliseModelString(entry) === wanted);
  return hit ? { tier: 'normalised', length: wanted.length } : null;
}

export function identityScore(match: ModelMatch, subject: ModelSubject): MatchScore | null {
  const hardware = hardwareScore(match, subject);
  if (hardware !== null) return hardware;
  if (match.exact.includes(subject.model)) {
    return { tier: 'exact', length: subject.model.length };
  }
  return prefixScore(match, subject.model) ?? normalisedScore(match, subject.model);
}

export function matchesFamily(match: ModelMatch, family: DeviceFamily): boolean {
  return match.families.includes(family);
}

export function brandAllowed(brands: readonly string[], subject: ModelSubject): boolean {
  if (brands.length === 0) return true;
  const names = [subject.brand, subject.manufacturer ?? ''].map((name) => name.toLowerCase());
  return brands.some((brand) => names.includes(brand.toLowerCase()));
}
