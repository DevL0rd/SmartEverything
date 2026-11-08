import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { withRole, type PresentedCapability } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Badge } from '../../../../components/badge';
import { Card } from '../../../../components/card';
import { ProgressBar } from '../../../../components/charts';
import { EmptyState } from '../../../../components/empty-state';
import { IconWell } from '../../../../components/icon-well';
import { OverflowButton } from '../../../../components/menu';
import { Text } from '../../../../components/text';
import { startOfDayKey } from '../../../../format/time';
import { useDeviceSeries } from '../../../../queries/history';
import { useDayKey } from '../../../../store/clock';
import type { Device } from '../../../../store/state';
import { useAction } from '../../controls/use-action';
import { useVacuum } from '../data/use-vacuum';
import {
  consumablesOf,
  lifeForecast,
  type ConsumableView,
  type LifeForecast,
} from '../model/consumables';
import {
  PART_ICON,
  TONE_COLOUR,
  careSummaryOf,
  partLineOf,
  resetRoleOf,
  type PartLine,
} from './care-model';

const log = new Logger('app.devices');

const HISTORY_HOURS = 720;

const VALUE_TONE = {
  positive: 'default',
  warning: 'warning',
  critical: 'critical',
  unknown: 'faint',
} as const;

function useForecast(device: Device, lifeKey: string | undefined): LifeForecast | null {
  const history = useDeviceSeries(device.id, lifeKey ?? '', HISTORY_HOURS, lifeKey !== undefined);
  const failed = history.isError;
  useEffect(() => {
    if (failed) {
      log.warn('vacuum.care_history_failed', { deviceId: device.id, capability: lifeKey ?? '' });
    }
  }, [device.id, failed, lifeKey]);
  return history.data === undefined ? null : lifeForecast(history.data);
}

function ResetMenu({
  device,
  presented,
  view,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly view: ConsumableView;
}): ReactNode {
  const opener = useRef<View>(null);
  const handle = useAction(device, presented, opener);
  return (
    <>
      <OverflowButton
        pressRef={opener}
        label={`${view.label} options`}
        items={[
          {
            label: 'I replaced it',
            description: `Resets the ${view.label.toLowerCase()} life counter`,
            icon: 'wrench',
            disabled: !device.online || handle.pending,
            onPress: handle.run,
          },
        ]}
      />
      {handle.sheet}
    </>
  );
}

function PartHeading({
  view,
  line,
}: {
  readonly view: ConsumableView;
  readonly line: PartLine;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="body-strong" numberOfLines={1} className="shrink">
        {view.label}
      </Text>
      {line.status === null ? null : <Badge label={line.status.label} tone={line.status.tone} />}
      <Text
        variant="body-strong"
        tone={VALUE_TONE[view.tone]}
        className="tabular ml-auto"
        accessibilityLiveRegion={line.status === null ? 'none' : 'polite'}
      >
        {line.value}
      </Text>
    </View>
  );
}

function PartRow({
  device,
  view,
  now,
}: {
  readonly device: Device;
  readonly view: ConsumableView;
  readonly now: number;
}): ReactNode {
  const { presentation, keyOf } = useVacuum(device);
  const forecast = useForecast(device, keyOf(view.lifeRole));
  const line = partLineOf(view, forecast, now);
  const resetRole = resetRoleOf(view);
  const reset = resetRole === null ? undefined : withRole(presentation, resetRole);
  const percent = view.lifePercent;
  return (
    <View className="min-h-touch-min min-w-72 grow basis-80 flex-row items-center gap-3 py-1.5">
      <IconWell icon={PART_ICON[view.part]} colour={TONE_COLOUR[view.tone]} />
      <View className="min-w-0 flex-1 gap-1.5">
        <PartHeading view={view} line={line} />
        <ProgressBar
          progress={percent === null ? null : percent / 100}
          colour={TONE_COLOUR[view.tone]}
          label={`${view.label} life`}
        />
        <View className="flex-row items-baseline gap-2">
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
            {line.left}
          </Text>
          {line.forecastDate === null ? null : (
            <Text variant="caption" tone="faint" numberOfLines={1} className="ml-auto">
              {line.forecastDate}
            </Text>
          )}
        </View>
      </View>
      {reset === undefined ? (
        <View className="size-touch-min" />
      ) : (
        <ResetMenu device={device} presented={reset} view={view} />
      )}
    </View>
  );
}

export function VacuumCare({ device }: { readonly device: Device }): ReactNode {
  const { snapshot } = useVacuum(device);
  const now = startOfDayKey(useDayKey());
  const views = consumablesOf(snapshot.values);
  const summary = careSummaryOf(views);
  if (views.length === 0) {
    return (
      <EmptyState
        icon="wrench"
        title="No wear data yet"
        body="The robot has not reported brush, filter or mop life."
      />
    );
  }
  return (
    <Card
      title="Wear parts"
      icon="wrench"
      action={
        summary === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Badge label={summary.label} tone={summary.tone} icon={summary.icon} />
          </View>
        )
      }
    >
      <View className="flex-row flex-wrap gap-x-6 gap-y-1">
        {views.map((view) => (
          <PartRow key={view.part} device={device} view={view} now={now} />
        ))}
        {views.length % 2 === 1 ? <View aria-hidden className="min-w-72 grow basis-80" /> : null}
      </View>
    </Card>
  );
}
