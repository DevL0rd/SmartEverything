import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsageLedgerRow } from '@smarteverything/domain';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useMoney } from '../../region';
import { DIMENSION_INFO, partIcon } from './costs-dimensions';
import { detailOfRow, titleOfRow } from './ledger-format';

export interface LedgerRowProps {
  readonly row: UsageLedgerRow;
  readonly timeZone: string;
  readonly showPerson: boolean;
  readonly onOpen: (row: UsageLedgerRow) => void;
}

export function LedgerRow({ row, timeZone, showPerson, onOpen }: LedgerRowProps): ReactNode {
  const money = useMoney();
  const title = titleOfRow(row);
  const cost = row.cost_available === false ? 'Unavailable' : money.cost(row.cost_micros);
  return (
    <Interactive
      label={`${title}, ${cost}, ${clock(row.at, timeZone)}`}
      onPress={() => {
        onOpen(row);
      }}
      className="min-h-row-h-2 w-full flex-row items-center gap-3 self-center rounded-md py-2 max-w-dashboard"
      layerClassName="rounded-md"
    >
      <IconWell icon={partIcon('work', row.work)} colour={DIMENSION_INFO.work.colour} size="m" />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-baseline gap-2">
          <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
            {title}
          </Text>
          <Text
            variant="body-strong"
            className="tabular"
            tone={row.cost_state === 'estimated' ? 'variant' : 'default'}
          >
            {row.cost_available !== false && row.cost_state === 'estimated' ? `≈ ${cost}` : cost}
          </Text>
        </View>
        <View className="flex-row items-baseline gap-2">
          <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
            {detailOfRow(row, showPerson)}
          </Text>
          <Text variant="caption" tone="faint" className="tabular">
            {clock(row.at, timeZone)}
          </Text>
        </View>
      </View>
    </Interactive>
  );
}
