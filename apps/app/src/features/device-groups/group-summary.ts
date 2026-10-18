import type { HsvColor, Spread, TargetState } from '@smarteverything/domain';
import { plural } from '../../format/text';

export interface GroupSummary {
  readonly text: string;
  readonly tone: 'primary' | 'variant';
}

export function spreadText(spread: Spread | null, unit: string): string {
  if (spread === null) return 'Off';
  return spread.min === spread.max
    ? `${String(spread.mean)}${unit}`
    : `${String(spread.min)}–${String(spread.max)}${unit}`;
}

export function groupSummary(state: TargetState): GroupSummary {
  if (state.power === 'none') return { text: 'All offline', tone: 'variant' };
  const offline = state.members - state.online;
  const tail = offline === 0 ? '' : ` · ${String(offline)} offline`;
  if (state.power === 'off') return { text: `All off${tail}`, tone: 'variant' };
  if (state.power === 'mixed')
    return { text: `${String(state.on)} of ${String(state.members)} on${tail}`, tone: 'primary' };
  const level = state.level === null ? '' : ` · ${spreadText(state.level, ' %')}`;
  return { text: `All on${level}${tail}`, tone: 'primary' };
}

export function pageSummary(state: TargetState, noun: MemberNoun): string {
  const count = plural(state.members, noun);
  if (state.members === 0) return 'No devices';
  if (state.power === 'none') return `${count} · all offline`;
  const offline = state.members - state.online;
  return [
    count,
    `${String(state.on)} on`,
    ...(offline === 0 ? [] : [`${String(offline)} offline`]),
  ].join(' · ');
}

export function orderMembers<T extends { readonly online: boolean }>(
  members: readonly T[],
): readonly T[] {
  return [
    ...members.filter((member) => member.online),
    ...members.filter((member) => !member.online),
  ];
}

export function powerTurnsOn(state: TargetState): boolean {
  return state.on === 0;
}

function partOf(state: TargetState, supported: number, noun: MemberNoun): string | null {
  return supported > 0 && supported < state.members
    ? `${String(supported)} of ${plural(state.members, noun)}`
    : null;
}

export function colourNote(state: TargetState, noun: MemberNoun): string | null {
  const part = partOf(state, state.support.color ?? 0, noun);
  return part === null ? null : `Colour: ${part}`;
}

export function bandLabel(state: TargetState, noun: MemberNoun): string {
  const supported = state.support.brightness ?? 0;
  return supported < state.members
    ? `Brightness · ${String(supported)} of ${String(state.members)}`
    : `All ${noun}s`;
}

export function bandScope(state: TargetState, noun: MemberNoun): string {
  return partOf(state, state.support.brightness ?? 0, noun) ?? `all ${noun}s`;
}

export function whiteScope(state: TargetState, noun: MemberNoun): string {
  return partOf(state, state.support.color_temperature ?? 0, noun) ?? `all ${noun}s`;
}

export type MemberNoun = 'light' | 'device';

export function memberNoun(lights: boolean): MemberNoun {
  return lights ? 'light' : 'device';
}

export function listLabel(noun: MemberNoun, name: string): string {
  return `${noun === 'light' ? 'Lights' : 'Devices'} in ${name}`;
}

export function moreLabel(count: number, noun: MemberNoun): string {
  return plural(count, `more ${noun}`);
}

const WHITE_BELOW_SATURATION = 15;
const HUE_NAMES: readonly (readonly [number, string])[] = [
  [15, 'red'],
  [45, 'amber'],
  [70, 'yellow'],
  [160, 'green'],
  [200, 'teal'],
  [260, 'blue'],
  [300, 'purple'],
  [345, 'pink'],
];

function colourName(colour: HsvColor): string {
  if (colour.saturation < WHITE_BELOW_SATURATION) return 'white';
  return HUE_NAMES.find(([below]) => colour.hue < below)?.[1] ?? 'red';
}

export function colourNames(colours: readonly HsvColor[]): string {
  const names = [...new Set(colours.map(colourName))];
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, and ${String(rest)} more` : shown.join(', ');
}
