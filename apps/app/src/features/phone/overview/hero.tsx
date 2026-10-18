import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Glow } from '../../../components/glow';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useAreaWidth } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { RingButton, TorchButton } from '../card/face-controls';
import { usePhoneFace, type PhoneFaceData } from '../card/use-phone-face';
import { useOpenLink } from '../frame/open-link';
import { bodyWidthOf } from '../model/sections';
import { phoneReadingsOf } from '../phone-values';
import { CONTEXT_TEXT } from '../phone-context-text';
import { BatteryArc } from './battery-arc';
import { heroFactsOf } from './facts';

const STACK_BELOW = 600;
const GLOW_STRENGTH = { light: 0.12, dark: 0.2 } as const;

function HeroGlow({ tone }: { readonly tone: PhoneFaceData['word']['tone'] }): ReactNode {
  const strength = GLOW_STRENGTH[useUniwind().theme === 'light' ? 'light' : 'dark'];
  if (tone === 'neutral') return null;
  return <Glow colour={tone} x="14%" y="40%" radius="70%" strength={strength} />;
}

function DoingLine({
  data,
  place,
}: {
  readonly data: PhoneFaceData;
  readonly place: string | null;
}): ReactNode {
  const now = useMinute();
  const { doing } = data.readings;
  if (!data.online || doing === null) return null;
  return (
    <Text variant="callout" tone="variant" numberOfLines={1}>
      {joinParts([`${CONTEXT_TEXT[doing.state]} · ${relative(doing.at, now)}`, place])}
    </Text>
  );
}

function Actions({
  device,
  data,
}: {
  readonly device: Device;
  readonly data: PhoneFaceData;
}): ReactNode {
  const onOpenLink = useOpenLink();
  const { controls, access } = data;
  if (!access.view.canAct) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {access.view.canRing ? (
        <RingButton device={device} ringing={controls.ringing} compact={false} />
      ) : null}
      {access.torch === 'unsupported' ? null : (
        <TorchButton device={device} on={controls.torchOn} />
      )}
      {access.view.canOpenLink ? (
        <Button label="Open a link" icon="externalLink" variant="tonal" onPress={onOpenLink} />
      ) : null}
    </View>
  );
}

function HeroTitle({
  data,
  place,
  stacked,
}: {
  readonly data: PhoneFaceData;
  readonly place: string | null;
  readonly stacked: boolean;
}): ReactNode {
  const { word } = data;
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text
        variant={stacked ? 'title-2' : 'title-1'}
        tone={word.tone === 'neutral' ? 'default' : word.tone}
        accessibilityRole="header"
      >
        {word.word}
      </Text>
      {word.detail === null ? null : (
        <Text variant="callout" tone="variant">
          {word.detail}
        </Text>
      )}
      <DoingLine data={data} place={place} />
    </View>
  );
}

function HeroDetails({
  device,
  data,
  line,
}: {
  readonly device: Device;
  readonly data: PhoneFaceData;
  readonly line: string;
}): ReactNode {
  return (
    <>
      {line === '' ? null : (
        <Text variant="footnote" tone="variant">
          {line}
        </Text>
      )}
      <Actions device={device} data={data} />
    </>
  );
}

export function PhoneHero({ device }: { readonly device: Device }): ReactNode {
  const data = usePhoneFace(device);
  const { width, onLayout } = useMeasuredWidth(undefined, bodyWidthOf(useAreaWidth()));
  const stacked = width < STACK_BELOW;
  const { word, readings, online } = data;
  const { line, place } = useDeviceDerived(
    device.id,
    (values) => heroFactsOf(phoneReadingsOf(values)),
    [],
    sameJson,
  );
  const title = <HeroTitle data={data} place={place} stacked={stacked} />;
  const details = <HeroDetails device={device} data={data} line={line} />;
  const arc = <BatteryArc level={readings.battery} tone={word.tone} stale={!online} />;
  return (
    <Card className="overflow-hidden">
      <HeroGlow tone={online ? word.tone : 'neutral'} />
      <View
        onLayout={onLayout}
        accessibilityRole="summary"
        accessibilityLabel={word.word}
        className={stacked ? 'gap-3.5' : 'flex-row items-center gap-5'}
      >
        <View className="items-center">
          <DeviceVisual device={device} size="hero" />
        </View>
        {stacked ? (
          <>
            <View className="flex-row items-center gap-4">
              {arc}
              {title}
            </View>
            {details}
          </>
        ) : (
          <>
            {arc}
            <View className="min-w-0 flex-1 gap-2.5">
              {title}
              {details}
            </View>
          </>
        )}
      </View>
    </Card>
  );
}
