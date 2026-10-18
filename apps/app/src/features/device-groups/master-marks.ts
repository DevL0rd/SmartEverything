import type { Spread, TargetState } from '@smarteverything/domain';
import type { Mixed } from '../../components/level-math';

export function mixedOf(
  spread: Spread | null,
  colours: Readonly<Record<string, string>>,
  fallback: string,
): Mixed | undefined {
  if (spread === null || spread.min === spread.max) return undefined;
  return {
    min: spread.min,
    max: spread.max,
    ticks: spread.perMember.map((member) => ({
      value: member.value,
      colour: colours[member.deviceId] ?? fallback,
    })),
  };
}

export function sharedTint(
  state: TargetState,
  colours: Readonly<Record<string, string>>,
): string | undefined {
  const lit = state.level?.perMember ?? [];
  const first = lit[0] === undefined ? undefined : colours[lit[0].deviceId];
  return first !== undefined && lit.every((member) => colours[member.deviceId] === first)
    ? first
    : undefined;
}

export function ringColours(colours: Readonly<Record<string, string>>): readonly string[] {
  return [...new Set(Object.values(colours))];
}
