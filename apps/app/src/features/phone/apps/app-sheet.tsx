import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Bars } from '../../../components/charts';
import { ReasonLine } from '../../../components/reason-line';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { usePhoneRun } from '../data/phone-action';
import { launchAppAction } from '../model/phone-page-actions';
import { todayKeyOf, weekBarsOf, type AppRow } from '../model/apps-model';
import { AppIcon } from './app-icon';

const BARS_HEIGHT = 120;

export interface AppFacts {
  readonly bytes: number | null;
  readonly notifications: number;
  readonly usageAllowed: boolean;
}

function factsLine(facts: AppFacts): string {
  const parts = [
    facts.bytes === null ? null : bytes(facts.bytes),
    `${String(facts.notifications)} ${facts.notifications === 1 ? 'notification' : 'notifications'}`,
  ];
  return parts.filter((part) => part !== null).join(' · ');
}

function Usage({
  row,
  usageAllowed,
}: {
  readonly row: AppRow;
  readonly usageAllowed: boolean;
}): ReactNode {
  const now = useMinute();
  if (!usageAllowed) {
    return (
      <ReasonLine
        icon="alert"
        tone="warning"
        text="Allow App usage access on the phone to see how long it is used."
      />
    );
  }
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {`Last 7 days · ${hoursMinutes(row.minutesToday)} today`}
      </Text>
      <Bars
        bars={weekBarsOf(row.minutesByDay, now)}
        colour="viz-1"
        label={`${row.label} minutes per day, ${hoursMinutes(row.minutesToday)} today`}
        height={BARS_HEIGHT}
        highlightKey={todayKeyOf(row.minutesByDay)}
        formatValue={(value) => hoursMinutes(value)}
      />
    </View>
  );
}

function SheetActions({
  device,
  row,
  notifications,
  canLaunch,
  onClose,
  onShowNotifications,
}: {
  readonly device: Device;
  readonly row: AppRow;
  readonly notifications: number;
  readonly canLaunch: boolean;
  readonly onClose: () => void;
  readonly onShowNotifications: (app: AppRow) => void;
}): ReactNode {
  const launch = usePhoneRun(device);
  return (
    <View className="flex-row flex-wrap justify-end gap-2 px-4 py-3">
      {notifications > 0 ? (
        <Button
          label="Show notifications"
          variant="tonal"
          onPress={() => {
            onShowNotifications(row);
          }}
        />
      ) : null}
      <Button
        label="Open on the phone"
        variant="filled"
        loading={launch.isPending}
        disabled={!canLaunch || !device.online}
        onPress={() => {
          launch.mutate(
            {
              action: launchAppAction(row.package),
              failure: `${row.label} did not open`,
            },
            { onSuccess: onClose },
          );
        }}
      />
    </View>
  );
}

export function AppSheet({
  device,
  row,
  facts,
  canLaunch,
  onClose,
  onShowNotifications,
}: {
  readonly device: Device;
  readonly row: AppRow | null;
  readonly facts: AppFacts;
  readonly canLaunch: boolean;
  readonly onClose: () => void;
  readonly onShowNotifications: (app: AppRow) => void;
}): ReactNode {
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row?.label ?? 'App'}
      detents={['half']}
      footer={
        row === null ? undefined : (
          <SheetActions
            device={device}
            row={row}
            notifications={facts.notifications}
            canLaunch={canLaunch}
            onClose={onClose}
            onShowNotifications={onShowNotifications}
          />
        )
      }
    >
      {row === null ? null : (
        <View className="gap-4 px-4 pb-4">
          <View className="flex-row items-center gap-3">
            <AppIcon label={row.label} iconHash={row.iconHash} size="l" />
            <Text variant="callout" tone="variant" className="flex-1">
              {factsLine(facts)}
            </Text>
          </View>
          <Usage row={row} usageAllowed={facts.usageAllowed} />
        </View>
      )}
    </Sheet>
  );
}
