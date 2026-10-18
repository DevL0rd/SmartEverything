import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Glow } from '../../../components/glow';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useAreaWidth } from '../../../design/size-class';
import { clock } from '../../../format/time';
import type { Device } from '../../../store/state';
import { ServiceMedallion } from '../../../plugins/shared/service-medallion';
import { useHeadline } from '../data/computer-headlines';
import { useComputerSelect } from '../data/computer-metrics';
import { computerGlyph, isHub, offersAction, useComputerCommand } from '../data/computer-device';
import { useScreenshotToChat } from '../files/screenshot';
import { factsLine, type ComputerStatus } from '../model/computer-view';
import { bodyWidthOf } from '../model/sections';

const STACK_BELOW = 600;
const BUSY_RING = 50;
const GLOW_STRENGTH = { light: 0.12, dark: 0.2 } as const;

function HeroMedallion({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  const load = useComputerSelect(device.id, (parts) =>
    parts.summary === undefined ? null : Math.round(parts.summary.cpuLoad),
  );
  return (
    <ServiceMedallion
      glyph={computerGlyph(device)}
      tone={status.tone}
      ratio={load === null ? null : load / 100}
      live={load !== null && load >= BUSY_RING && !status.offline}
      size="hero"
      label={`${status.word}${load === null ? '' : `, processor ${String(load)} percent`}`}
      offline={status.offline}
    />
  );
}

function FactsText({ deviceId }: { readonly deviceId: string }): ReactNode {
  const line = useComputerSelect(deviceId, (parts) =>
    parts.summary === undefined ? null : factsLine(parts.summary),
  );
  return line === null ? null : (
    <Text variant="footnote" tone="variant">
      {line}
    </Text>
  );
}

function WakeActions({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  if (!offersAction(device, 'wake')) {
    return (
      <Text variant="callout" tone="variant">
        This computer can’t be woken from here.
      </Text>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Button
        label="Wake"
        icon="power"
        onPress={() => {
          run('wake', null);
        }}
      />
      <Text variant="footnote" tone="variant">
        Lock, Sleep and Screenshot need the computer to be on.
      </Text>
    </View>
  );
}

function ScreenshotAction({ deviceId }: { readonly deviceId: string }): ReactNode {
  const shot = useScreenshotToChat(deviceId);
  return (
    <Button
      label="Screenshot"
      icon="camera"
      variant="tonal"
      disabled={shot.reason !== null || shot.pending}
      onPress={shot.run}
    />
  );
}

function PowerActions({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {offersAction(device, 'lock_screen') ? (
        <Button
          label="Lock"
          icon="lock"
          variant="tonal"
          onPress={() => {
            run('lock_screen', null);
          }}
        />
      ) : null}
      {offersAction(device, 'sleep') && !isHub(device) ? (
        <Button
          label="Sleep"
          icon="moon"
          variant="tonal"
          onPress={() => {
            run('sleep', null);
          }}
        />
      ) : null}
      <ScreenshotAction deviceId={device.id} />
    </View>
  );
}

function Actions({
  device,
  offline,
}: {
  readonly device: Device;
  readonly offline: boolean;
}): ReactNode {
  return offline ? <WakeActions device={device} /> : <PowerActions device={device} />;
}

function HeroGlow({
  tone,
}: {
  readonly tone: 'positive' | 'info' | 'warning' | 'critical';
}): ReactNode {
  const strength = GLOW_STRENGTH[useUniwind().theme === 'light' ? 'light' : 'dark'];
  return <Glow colour={tone} x="14%" y="40%" radius="70%" strength={strength} />;
}

function Details({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  return (
    <>
      <FactsText deviceId={device.id} />
      <Actions device={device} offline={status.offline} />
    </>
  );
}

function HeroTitle({
  title,
  status,
  stacked,
}: {
  readonly title: string;
  readonly status: ComputerStatus;
  readonly stacked: boolean;
}): ReactNode {
  return (
    <Text
      variant={stacked ? 'title-2' : 'title-1'}
      tone={status.tone === 'neutral' ? 'default' : status.tone}
      accessibilityRole="header"
    >
      {title}
    </Text>
  );
}

function LastReadingTitle({
  deviceId,
  status,
  stacked,
}: {
  readonly deviceId: string;
  readonly status: ComputerStatus;
  readonly stacked: boolean;
}): ReactNode {
  const last = useHeadline(deviceId, 'cpu_load');
  const title = last === null ? 'No recent readings' : `Last reading ${clock(last.at)}`;
  return <HeroTitle title={title} status={status} stacked={stacked} />;
}

function HeroHead({
  deviceId,
  status,
  stacked,
}: {
  readonly deviceId: string;
  readonly status: ComputerStatus;
  readonly stacked: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      {status.offline ? (
        <LastReadingTitle deviceId={deviceId} status={status} stacked={stacked} />
      ) : (
        <HeroTitle title={status.word} status={status} stacked={stacked} />
      )}
    </View>
  );
}

export function ComputerHero({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth(undefined, bodyWidthOf(useAreaWidth()));
  const stacked = width < STACK_BELOW;
  const head = <HeroHead deviceId={device.id} status={status} stacked={stacked} />;
  const details = <Details device={device} status={status} />;
  return (
    <Card className="overflow-hidden">
      {status.tone === 'neutral' ? null : <HeroGlow tone={status.tone} />}
      <View
        onLayout={onLayout}
        accessibilityRole="summary"
        accessibilityLabel={status.word}
        className={stacked ? 'gap-3.5' : 'flex-row items-center gap-5'}
      >
        {stacked ? (
          <>
            <View className="flex-row items-center gap-4">
              <HeroMedallion device={device} status={status} />
              {head}
            </View>
            {details}
          </>
        ) : (
          <>
            <HeroMedallion device={device} status={status} />
            <View className="min-w-0 flex-1 gap-2.5">
              {head}
              {details}
            </View>
          </>
        )}
      </View>
    </Card>
  );
}
