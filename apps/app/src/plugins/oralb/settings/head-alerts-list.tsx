import type { ReactNode } from 'react';
import { View } from 'react-native';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { useConfigure } from '../../toothbrush/data/brush-act';
import { Anchored } from '../../toothbrush/settings/anchored';
import { StepperRow } from '../../toothbrush/settings/rows';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { fillStyle } from '../../toothbrush/charts/style';
import { useOralbConfig } from '../data/use-oralb';
import { DEFAULT_BASELINE_DAYS } from '../model/care-model';
import { HEAD_DUE_RANGE, HEAD_WARN_RANGE, daysBarOf } from '../model/settings-model';

function DaysBar({
  warnDays,
  dueDays,
  baseline,
}: {
  readonly warnDays: number;
  readonly dueDays: number;
  readonly baseline: number;
}): ReactNode {
  const bar = daysBarOf(warnDays, dueDays, baseline);
  const critical = useColour('critical');
  const warning = useColour('warning');
  const positive = useColour('positive');
  return (
    <View
      accessible
      accessibilityLabel={`A new head lasts about ${String(baseline)} days. Warning at ${String(warnDays)} days left, due at ${String(dueDays)}.`}
      className="gap-1 px-4 py-2"
    >
      <View aria-hidden className="h-3 flex-row overflow-hidden rounded-full">
        <View style={fillStyle(Math.max(0.001, bar.due), critical, 0.9)} />
        <View style={fillStyle(Math.max(0.001, bar.warn - bar.due), warning, 0.9)} />
        <View style={fillStyle(Math.max(0.001, 1 - bar.warn), positive, 0.9)} />
      </View>
      <View aria-hidden className="flex-row justify-between">
        <Text variant="caption" tone="variant">
          Due
        </Text>
        <Text variant="caption" tone="variant">
          New head
        </Text>
      </View>
    </View>
  );
}

export function HeadAlertsList({ deviceId, state }: SettingsProps): ReactNode {
  const { oralb } = useOralbConfig(deviceId);
  const configure = useConfigure(deviceId);
  if (state.profile.head !== 'countdown' || !state.mayConfigure) {
    return null;
  }
  return (
    <Anchored deviceId={deviceId} id="oralb-head-alerts" label="Brush head alerts">
      <List
        inset
        title="Brush head alerts"
        footer="The handle counts the days. Alerts reach you as notifications and can start automations."
      >
        <Anchored
          deviceId={deviceId}
          id="oralb-head-warn"
          label="Warn before the brush head is due"
        >
          <StepperRow
            title="Warn before the brush head is due"
            subtitle="Days left when the warning comes"
            value={oralb.headWarnDays}
            range={HEAD_WARN_RANGE}
            unit="d"
            onChange={(next) => {
              configure({ oralb: { headWarnDays: next } });
            }}
          />
        </Anchored>
        <Anchored deviceId={deviceId} id="oralb-head-due" label="Days left when the head is due">
          <StepperRow
            title="Days left when the head is due"
            subtitle="The head counts as due at this many days left"
            value={oralb.headDueDays}
            range={HEAD_DUE_RANGE}
            unit="d"
            onChange={(next) => {
              configure({ oralb: { headDueDays: next } });
            }}
          />
        </Anchored>
        <DaysBar
          warnDays={oralb.headWarnDays}
          dueDays={oralb.headDueDays}
          baseline={state.head.baselineDays ?? DEFAULT_BASELINE_DAYS}
        />
      </List>
    </Anchored>
  );
}
