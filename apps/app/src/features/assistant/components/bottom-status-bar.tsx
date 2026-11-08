import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { Tone } from '../../../components/tone';
import { Text } from '../../../components/text';
import {
  BOTTOM_AREA_ID,
  BOTTOM_PANELS,
  type BottomPanel,
  type BottomVisibility,
  type Indicator,
} from './bottom-status-model';

const WELL = 'min-h-touch-min min-w-touch-min flex-row items-center gap-1.5 rounded-sm px-1.5';

const ICON: Readonly<Record<BottomPanel, IconName>> = {
  goal: 'trophy',
  tasks: 'list',
  jobs: 'terminal',
};

const ICON_TONE: Readonly<Record<BottomPanel, Tone>> = {
  goal: 'primary',
  tasks: 'positive',
  jobs: 'info',
};

function StatusWell({
  indicator,
  expanded,
  onPress,
}: {
  readonly indicator: Indicator;
  readonly expanded: boolean;
  readonly onPress: (panel: BottomPanel) => void;
}): ReactNode {
  return (
    <Interactive
      label={indicator.label}
      expanded={expanded}
      controls={BOTTOM_AREA_ID}
      onPress={(): void => {
        onPress(indicator.panel);
      }}
      className={WELL}
      layerClassName="rounded-sm"
    >
      <Icon
        name={ICON[indicator.panel]}
        size={16}
        tone={indicator.alert ? 'warning' : ICON_TONE[indicator.panel]}
      />
      <Text variant="caption" tone={indicator.alert ? 'warning' : 'variant'} className="tabular">
        {indicator.text}
      </Text>
    </Interactive>
  );
}

const EMPTY_LABEL: Readonly<Record<BottomPanel, string>> = {
  goal: 'Goal, none set',
  tasks: 'Tasks, none',
  jobs: 'Background jobs, none running',
};

export function StatusWells({
  indicators,
  visibility,
  onPress,
}: {
  readonly indicators: readonly Indicator[];
  readonly visibility: BottomVisibility;
  readonly onPress: (panel: BottomPanel) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center">
      {BOTTOM_PANELS.map((panel) => (
        <StatusWell
          key={panel}
          indicator={
            indicators.find((indicator) => indicator.panel === panel) ?? {
              panel,
              label: EMPTY_LABEL[panel],
              text: '—',
              alert: false,
            }
          }
          expanded={visibility.expanded ? visibility.open[panel] : false}
          onPress={onPress}
        />
      ))}
    </View>
  );
}
