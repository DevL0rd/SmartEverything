import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { StateTimeline } from '../../../components/charts';
import { LevelPill } from '../../../components/level-pill';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { usePowerTimeline } from '../button/use-power-timeline';
import { DeviceStage } from '../detail/device-stage';
import { deviceModelOf } from '../model/device-model';
import {
  diffuserStatus,
  lowBattery,
  paused,
  refillLine,
  showsFault,
  sprayTicks,
  strengthLine,
} from './diffuser-model';
import type { DiffuserRead } from './diffuser-read';
import { sendRefill } from './refill-action';
import { RhythmStrip } from './rhythm-strip';
import { TurnOnButton } from './turn-on-button';
import { useDiffuserRead, useDiffuserSchedule, useHoursSinceRefill } from './use-diffuser';

const HERO_STRIP = 32;
const TODAY_STRIP = 28;

function HeroFacts({
  device,
  read,
}: {
  readonly device: Device;
  readonly read: DiffuserRead;
}): ReactNode {
  const hours = useHoursSinceRefill(device.id);
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {read.battery === null ? null : (
        <LevelPill
          percent={read.battery}
          label={read.charging ? `${String(read.battery)} % charging` : `${String(read.battery)} %`}
        />
      )}
      {lowBattery(read) && !read.charging ? (
        <Text variant="caption" tone="warning">
          Charge soon
        </Text>
      ) : null}
      {hours === null ? null : (
        <Text variant="caption" tone="variant">
          {refillLine(hours)}
        </Text>
      )}
    </View>
  );
}

function HeroState({ read }: { readonly read: DiffuserRead }): ReactNode {
  const status = diffuserStatus(read);
  const line = strengthLine(read);
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-3">
      <Badge label={status.label} tone={status.tone} />
      {line === null ? null : (
        <Text variant="callout" tone={showsFault(read) ? 'critical' : 'variant'} align="center">
          {line}
        </Text>
      )}
    </View>
  );
}

export function DiffuserHero({ device }: { readonly device: Device }): ReactNode {
  const read = useDiffuserRead(device);
  return (
    <Card>
      <View className="gap-4 py-2">
        <View className="items-center">
          <DeviceStage device={device} />
        </View>
        <HeroState read={read} />
        <HeroFacts device={device} read={read} />
        <RhythmStrip
          intervalMinutes={read.rhythm?.intervalMinutes ?? null}
          paused={paused(read)}
          height={HERO_STRIP}
        />
        {read.power === 'off' ? (
          <View className="items-center">
            <TurnOnButton device={device} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function TodayCard({ device }: { readonly device: Device }): ReactNode {
  const read = useDiffuserRead(device);
  const power = deviceModelOf(device).power?.key ?? null;
  const timeline = usePowerTimeline(device.id, power, true);
  const interval = read.rhythm?.intervalMinutes ?? null;
  return (
    <Card title="Today" icon="clock">
      <View className="gap-2">
        <StateTimeline
          segments={timeline.segments}
          colours={{ on: 'primary' }}
          label="When it was on in the last 24 hours, one tick per spray"
          height={TODAY_STRIP}
          from={timeline.from}
          to={timeline.to}
          ticks={interval === null ? [] : sprayTicks(timeline.segments, interval)}
          captions={['24 h ago', 'Now']}
          empty="No data yet"
          track="surface-2"
        />
        <Text variant="footnote" tone="variant">
          One tick per spray while it was on.
        </Text>
      </View>
    </Card>
  );
}

function ScheduleCard({ device }: { readonly device: Device }): ReactNode {
  const schedule = useDiffuserSchedule(device.id);
  return (
    <Card title="Schedule" icon="calendar" padding="none">
      <ListRow
        title={schedule === null ? 'No schedule' : schedule.text}
        subtitle="Turns the diffuser on and off"
        icon="clock"
        chevron
        href={
          schedule === null ? href.scheduledNew(device.id) : href.automation(schedule.automationId)
        }
        label={schedule === null ? 'No schedule. Add one' : `Schedule ${schedule.text}. Edit`}
      />
    </Card>
  );
}

function RefillCard({ device }: { readonly device: Device }): ReactNode {
  const hours = useHoursSinceRefill(device.id);
  return (
    <Card title="Refill" icon="droplet">
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          It has no fragrance sensor, so we count the hours instead of guessing a percentage. The
          date is shared with everyone at home.
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">
          <Text variant="callout" className="flex-1">
            {hours === null ? 'No refill recorded' : refillLine(hours)}
          </Text>
          <Button
            label="I refilled it"
            variant="tonal"
            icon="droplet"
            onPress={() => {
              sendRefill(device.id);
            }}
          />
        </View>
      </View>
    </Card>
  );
}

export function DiffuserDetails({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-section-gap">
      <TodayCard device={device} />
      <ScheduleCard device={device} />
      <RefillCard device={device} />
    </View>
  );
}
