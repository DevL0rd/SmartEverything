import type { ReactNode } from 'react';
import { DRIVE_VIA, type DriveVia } from '@smarteverything/domain';
import { FilterChip } from '../../../components/filter-chip';
import { VIA_LOOK } from './via-model';

export interface ViaChipsProps {
  readonly vias: ReadonlySet<DriveVia>;
  readonly onAny: () => void;
  readonly onToggle: (via: DriveVia) => void;
}

export function ViaChips({ vias, onAny, onToggle }: ViaChipsProps): ReactNode {
  return (
    <>
      <FilterChip label="How" value="Any way" active={vias.size === 0} onPress={onAny} />
      {DRIVE_VIA.map((via) => (
        <FilterChip
          key={via}
          label="How"
          value={VIA_LOOK[via].chip}
          active={vias.has(via)}
          onPress={() => {
            onToggle(via);
          }}
        />
      ))}
    </>
  );
}
