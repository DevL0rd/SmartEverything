import type { BrushGattDump } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { Status } from '../../toothbrush/setup/find-steps';
import type { Progress } from '../../toothbrush/setup/use-setup';
import { StaticBrush } from '../../toothbrush/setup/static-brush';
import {
  identityOf,
  variantLine,
  verifyRows,
  isSupported,
  ringHexOf,
  type Heard,
  type VerifyRow,
} from './dump-reading';

function Row({ item }: { readonly item: VerifyRow }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${item.label}: ${item.value}`}
      className="min-h-touch-min flex-row items-center gap-3 py-1"
    >
      <View className="size-6 items-center justify-center">
        {item.state === 'read' ? (
          <Icon name="circleCheck" size={20} tone="positive" />
        ) : (
          <Icon name="circle" size={20} tone="faint" />
        )}
      </View>
      <Text variant="callout" className="w-40" numberOfLines={2}>
        {item.label}
      </Text>
      <Text
        variant="callout"
        tone={item.state === 'read' ? 'default' : 'variant'}
        className="min-w-0 flex-1"
      >
        {item.value}
      </Text>
    </View>
  );
}

function Checklist({
  heard,
  dump,
}: {
  readonly heard: Heard;
  readonly dump: BrushGattDump;
}): ReactNode {
  const identity = identityOf(heard, dump);
  return (
    <View className="gap-3">
      {identity.ok ? (
        <Banner
          tone={isSupported(identity.identity.protocol) ? 'positive' : 'critical'}
          title="Read the brush"
          body={variantLine(identity.identity.protocol)}
          wrapBody
        />
      ) : (
        <Banner
          tone="critical"
          title="This brush cannot be added"
          body={identity.reason}
          wrapBody
        />
      )}
      <View className="flex-row items-center gap-3">
        <StaticBrush brand="oralb" px={96} ring={ringHexOf(dump)} />
        <View className="min-w-0 flex-1">
          {verifyRows(heard, dump).map((item) => (
            <Row key={item.key} item={item} />
          ))}
        </View>
      </View>
    </View>
  );
}

export function OralbVerifyStep({
  progress,
  dump,
  heard,
  onVerify,
}: {
  readonly progress: Progress;
  readonly dump: BrushGattDump | null;
  readonly heard: Heard | null;
  readonly onVerify: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        SmartEverything connects once, reads what the brush offers and disconnects. Nothing is
        written to the brush.
      </Text>
      <Status progress={progress} failure="The brush did not answer" working="Reading the brush…" />
      {dump !== null && heard !== null ? (
        <Checklist heard={heard} dump={dump} />
      ) : (
        <Button
          label={progress.kind === 'failed' ? 'Try again' : 'Read the brush'}
          size="lg"
          loading={progress.kind === 'working'}
          onPress={onVerify}
        />
      )}
    </View>
  );
}
