import type { BodyReadingRow, ProfileRow } from '@smarteverything/domain';

export const NO_SLOT = 'none';

export interface SlotChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

function lastWeigh(readings: readonly BodyReadingRow[], slot: number): BodyReadingRow | null {
  return readings
    .filter((reading) => reading.scale_user === slot && reading.weight_kg !== null)
    .reduce<BodyReadingRow | null>(
      (latest, reading) =>
        latest === null || reading.measured_at > latest.measured_at ? reading : latest,
      null,
    );
}

export function slotChoices(
  readings: readonly BodyReadingRow[],
  profiles: readonly ProfileRow[],
  current: number | null,
): readonly SlotChoice[] {
  const seen = new Set<number>(
    readings.flatMap((reading) => (reading.scale_user === null ? [] : [reading.scale_user])),
  );
  if (current !== null) {
    seen.add(current);
  }
  const slots = [...seen]
    .sort((left, right) => left - right)
    .map((slot) => {
      const holder = profiles.find((profile) => profile.scale_user === slot);
      const latest = lastWeigh(readings, slot);
      const parts = [
        latest?.weight_kg === undefined || latest.weight_kg === null
          ? null
          : `last ${String(latest.weight_kg)} kg`,
        holder === undefined ? null : `now ${holder.name}`,
      ].filter((part): part is string => part !== null);
      return {
        value: String(slot),
        label: `Scale person ${String(slot)}`,
        ...(parts.length === 0 ? {} : { description: parts.join(', ') }),
      };
    });
  return [{ value: NO_SLOT, label: 'Not linked' }, ...slots];
}

export function slotOf(value: string): number | null {
  return value === NO_SLOT ? null : Number(value);
}
