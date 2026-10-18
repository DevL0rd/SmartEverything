import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { CycleRows } from './cycle-rows';
import { HISTORY_CYCLES } from './cycles';
import { useCycles } from './use-cycles';

const EMPTY_TEXT = 'Nothing cooked yet. Each cycle shows up here.';

export function MicrowaveHistory({ deviceId }: { readonly deviceId: string }): ReactNode {
  const cycles = useCycles(deviceId, true).slice(0, HISTORY_CYCLES);
  return (
    <Card title="Recent cooking" icon="clock">
      {cycles.length === 0 ? (
        <Text variant="footnote" tone="variant">
          {EMPTY_TEXT}
        </Text>
      ) : (
        <CycleRows cycles={cycles} label="Recent cooking" />
      )}
    </Card>
  );
}
