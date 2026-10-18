import {
  automationReferences,
  type AutomationRow,
  type AutomationV2,
  type DeviceTarget,
} from '@smarteverything/domain';

export interface AutomationUse {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export function automationsUsing(
  rows: readonly AutomationRow[],
  referenceId: string,
  parse: (row: AutomationRow) => AutomationV2 | null,
): readonly AutomationUse[] {
  return rows.flatMap((row) => {
    const automation = parse(row);
    return automation !== null && automationReferences(automation, referenceId)
      ? [{ id: row.id, name: row.name, enabled: row.enabled }]
      : [];
  });
}

export function referenceIdOf(target: DeviceTarget): string | null {
  switch (target.kind) {
    case 'group':
      return target.groupId;
    case 'room':
      return target.roomId;
    case 'devices':
      return null;
  }
}
