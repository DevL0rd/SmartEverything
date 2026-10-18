import {
  LAUNDRY_PROGRAMS,
  LAUNDRY_PROGRAM_GROUPS,
  dialPrograms,
  type JsonValue,
  type LaundryProgram,
  type LaundryProgramGroup,
} from '@smarteverything/domain';

export interface ProgramSection {
  readonly key: string;
  readonly title: string;
  readonly programs: readonly LaundryProgram[];
}

export function dialOf(hex: JsonValue | undefined): readonly LaundryProgram[] {
  return dialPrograms(hex);
}

export function chipPrograms(
  dial: readonly LaundryProgram[],
  selected: LaundryProgram | undefined,
): readonly LaundryProgram[] {
  if (selected === undefined || dial.some((entry) => entry.id === selected.id)) {
    return dial;
  }
  return [selected, ...dial];
}

export function morePrograms(dial: readonly LaundryProgram[]): readonly LaundryProgram[] {
  const onDial = new Set(dial.map((entry) => entry.id));
  return LAUNDRY_PROGRAMS.filter((entry) => !onDial.has(entry.id));
}

function matches(entry: LaundryProgram, query: string): boolean {
  return query === '' || entry.label.toLowerCase().includes(query);
}

export function programSections(
  dial: readonly LaundryProgram[],
  query: string,
): readonly ProgramSection[] {
  const text = query.trim().toLowerCase();
  const rest = morePrograms(dial);
  const grouped = LAUNDRY_PROGRAM_GROUPS.map((group: LaundryProgramGroup) => ({
    key: group,
    title: group,
    programs: rest.filter((entry) => entry.group === group && matches(entry, text)),
  }));
  const onDial = {
    key: 'dial',
    title: 'On your machine',
    programs: dial.filter((entry) => matches(entry, text)),
  };
  return [onDial, ...grouped].filter((section) => section.programs.length > 0);
}

export function selectedIndex(
  sections: readonly ProgramSection[],
  selected: LaundryProgram | undefined,
): number {
  return sections.findIndex((section) =>
    section.programs.some((entry) => entry.id === selected?.id),
  );
}
