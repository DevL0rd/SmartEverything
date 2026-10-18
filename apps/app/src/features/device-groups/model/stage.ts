import { colord } from 'colord';
import type { TargetState } from '@smarteverything/domain';
import { plural, sentenceCase } from '../../../format/text';
import type { MemberPower, TargetView } from '../use-target-state';
import { colourNames, spreadText, type MemberNoun } from '../group-summary';

export type MemberMark = 'failed' | 'pending';

export interface StageMember {
  readonly id: string;
  readonly name: string;
  readonly light: boolean;
  readonly power: MemberPower;
  readonly level: number | null;
  readonly colour: string | null;
  readonly mark: MemberMark | null;
}

interface Source {
  readonly id: string;
  readonly label: string;
  readonly light: boolean;
}

const HALO_MIN = 20;
const HALO_SPAN = 16;
const OPACITY_MIN = 0.35;
const OPACITY_SPAN = 0.55;
const POINTER_GROWTH = 1.15;
const WASH_FROM_LEVEL = 10;

export const BULB_WIDTH = { touch: 80, pointer: 88 } as const;
const UNKNOWN_LEVEL = 60;

export function haloOf(
  level: number | null,
  pointer: boolean,
): { readonly size: number; readonly opacity: number } {
  const share = (level ?? UNKNOWN_LEVEL) / 100;
  const size = (HALO_MIN + HALO_SPAN * share) * 2;
  return {
    size: Math.round(pointer ? size * POINTER_GROWTH : size),
    opacity: OPACITY_MIN + OPACITY_SPAN * share,
  };
}

export function stageMembers(
  members: readonly Source[],
  view: Pick<TargetView, 'powers' | 'colours' | 'state'>,
  marks: ReadonlyMap<string, MemberMark>,
): readonly StageMember[] {
  const levels = new Map((view.state.level?.perMember ?? []).map((m) => [m.deviceId, m.value]));
  return members.map((member) => ({
    id: member.id,
    name: member.label,
    light: member.light,
    power: view.powers[member.id] ?? 'off',
    level: levels.get(member.id) ?? null,
    colour: view.colours[member.id] ?? null,
    mark: marks.get(member.id) ?? null,
  }));
}

export function bulbLabel(member: StageMember): string {
  const word = (): string => {
    if (member.power === 'offline') return 'offline';
    if (member.mark === 'failed') return 'did not respond';
    if (member.mark === 'pending') return 'waiting for the light';
    if (member.power === 'off') return 'off';
    return member.level === null ? 'on' : `on, ${String(member.level)} percent`;
  };
  return `${member.name}, ${word()}, show`;
}

export function bulbCaption(member: StageMember): string {
  if (member.power === 'offline') return 'Offline';
  if (member.power === 'off') return 'Off';
  return member.level === null ? 'On' : `${String(member.level)} %`;
}

export function stageLabel(name: string, state: TargetState, noun: MemberNoun): string {
  const level = state.level === null ? '' : `, levels ${spreadText(state.level, ' %')}`;
  return `${name}: ${String(state.on)} of ${plural(state.members, noun)} on${level}`;
}

export function stageChips(state: TargetState): readonly string[] {
  if (state.on === 0) return [];
  const spread = state.level === null ? [] : [spreadText(state.level, ' %')];
  if (state.colours.length > 1) return [...spread, 'Mixed colours'];
  if (state.colours.length === 1) return [...spread, sentenceCase(colourNames(state.colours))];
  const white = state.whiteTemperature;
  return white === null ? spread : [...spread, spreadText(white, ' K')];
}

export function washColour(
  colours: Readonly<Record<string, string>>,
  state: Pick<TargetState, 'level'>,
): string | null {
  const levels = new Map((state.level?.perMember ?? []).map((m) => [m.deviceId, m.value]));
  const lit = Object.entries(colours).flatMap(([id, css]) => {
    const level = levels.get(id) ?? UNKNOWN_LEVEL;
    return level < WASH_FROM_LEVEL ? [] : [{ rgb: colord(css).toRgb(), level }];
  });
  const total = lit.reduce((sum, member) => sum + member.level, 0);
  if (total === 0) return null;
  const mean = (channel: 'r' | 'g' | 'b'): number =>
    lit.reduce((sum, member) => sum + member.rgb[channel] * member.level, 0) / total;
  return colord({ r: mean('r'), g: mean('g'), b: mean('b') }).toHex();
}
