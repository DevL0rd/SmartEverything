import type { MemberPower, TargetView } from '../use-target-state';
import { haloOf } from './stage';

export const MINI_STAGE_DOTS = 8;

export interface StageDot {
  readonly id: string;
  readonly power: MemberPower;
  readonly colour: string | null;
  readonly opacity: number;
}

export interface MiniStage {
  readonly dots: readonly StageDot[];
  readonly hidden: number;
}

export function miniStageOf(
  memberIds: readonly string[],
  view: Pick<TargetView, 'powers' | 'colours' | 'state'>,
): MiniStage {
  const levels = new Map((view.state.level?.perMember ?? []).map((m) => [m.deviceId, m.value]));
  const dots = memberIds.slice(0, MINI_STAGE_DOTS).map((id) => ({
    id,
    power: view.powers[id] ?? 'unknown',
    colour: view.colours[id] ?? null,
    opacity: haloOf(levels.get(id) ?? null, false).opacity,
  }));
  return { dots, hidden: Math.max(0, memberIds.length - MINI_STAGE_DOTS) };
}
