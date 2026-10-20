import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { fillStyle } from '../../toothbrush/charts/style';
import { ADVERT_NOTE, BAND_NAME, type MeterKind, type PressureBand } from '../model/gauge-model';
import { BAND_ROLE } from './force-gauge';

const ORDER: readonly PressureBand[] = ['light', 'good', 'hard'];

function Zone({
  band,
  active,
  dimmed,
}: {
  readonly band: PressureBand;
  readonly active: boolean;
  readonly dimmed: boolean;
}): ReactNode {
  const fill = useColour(BAND_ROLE[band]);
  return <View style={fillStyle(1, fill, dimmed ? 0.18 : active ? 1 : 0.45)} />;
}

export function StateMeter({
  kind,
  band,
  label,
}: {
  readonly kind: MeterKind;
  readonly band: PressureBand | null;
  readonly label: string;
}): ReactNode {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <View aria-hidden className="h-4 flex-row">
        {ORDER.map((zone) => (
          <View key={zone} className="flex-1 items-center justify-end">
            {zone === band ? <Icon name="chevronDown" size={16} tone="default" /> : null}
          </View>
        ))}
      </View>
      <View aria-hidden className="h-2.5 flex-row gap-0.5 overflow-hidden rounded-full">
        {ORDER.map((zone) => (
          <Zone
            key={zone}
            band={zone}
            active={zone === band}
            dimmed={kind === 'advert' && zone === 'light'}
          />
        ))}
      </View>
      <View aria-hidden className="flex-row">
        {ORDER.map((zone) => (
          <Text
            key={zone}
            variant="caption"
            tone={zone === band ? 'default' : 'variant'}
            align="center"
            className={cn('flex-1', zone === band && 'font-sans-semibold')}
          >
            {BAND_NAME[zone]}
          </Text>
        ))}
      </View>
      {kind === 'advert' ? (
        <Text variant="caption" tone="faint" align="center">
          {ADVERT_NOTE}
        </Text>
      ) : null}
    </View>
  );
}
