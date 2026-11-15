import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { DRIVE_VIA, type DriveVia } from '@smarteverything/domain';
import { FilterChip } from '../../../components/filter-chip';
import type { RevealRange } from '../../../components/h-scroller';
import { VIA_LOOK } from './via-model';

export interface ViaChipsProps {
  readonly vias: ReadonlySet<DriveVia>;
  readonly onAny: () => void;
  readonly onToggle: (via: DriveVia) => void;
  readonly onRange: (via: DriveVia, range: RevealRange) => void;
}

export function ViaChips({ vias, onAny, onToggle, onRange }: ViaChipsProps): ReactNode {
  return (
    <>
      <FilterChip label="How" value="Any way" active={vias.size === 0} onPress={onAny} />
      {DRIVE_VIA.map((via) => (
        <View
          key={via}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            onRange(via, { x, width });
          }}
        >
          <FilterChip
            label="How"
            value={VIA_LOOK[via].chip}
            active={vias.has(via)}
            onPress={() => {
              onToggle(via);
            }}
          />
        </View>
      ))}
    </>
  );
}

type ViaRanges = ReadonlyMap<DriveVia, RevealRange>;

export function useViaReveal(vias: ReadonlySet<DriveVia>): {
  readonly reveal: RevealRange | null;
  readonly onRange: (via: DriveVia, range: RevealRange) => void;
} {
  const [ranges, setRanges] = useState<ViaRanges>(new Map());
  const first = DRIVE_VIA.find((via) => vias.has(via));
  return {
    reveal: first === undefined ? null : (ranges.get(first) ?? null),
    onRange: (via, range): void => {
      setRanges((now) => {
        const held = now.get(via);
        if (held?.x === range.x && held.width === range.width) return now;
        return new Map(now).set(via, range);
      });
    },
  };
}
