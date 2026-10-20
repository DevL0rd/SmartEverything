import { useState, type ReactNode } from 'react';
import { PairComputerSheet } from '../../computers';
import { NavRow } from '../../../components/rows';

export function PairComputerRow(): ReactNode {
  const [pair, setPair] = useState(false);
  return (
    <>
      <NavRow
        title="Pair a computer"
        subtitle="Use Claude and Codex on a computer"
        icon="monitor"
        onPress={() => {
          setPair(true);
        }}
      />
      <PairComputerSheet
        open={pair}
        onClose={() => {
          setPair(false);
        }}
      />
    </>
  );
}
