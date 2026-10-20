import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { QrCode } from '../../../components/qr-code';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useProviderLink } from '../../../store/selectors';
import { qrMinutesLeft, qrShareLeft } from '../model/qr-expiry';
import { SCAN_STEPS } from '../model/tuya-link';

const QR_SIZE = 192;
const RING_SIZE = 296;
const RING_THICKNESS = 8;
const LOW_SHARE = 0.2;

function MinutesLeft(): ReactNode {
  const left = qrMinutesLeft(useProviderLink('tuya'), useMinute());
  if (left === null) {
    return null;
  }
  return (
    <Text variant="footnote" tone="variant">
      {left > 0 ? `Expires in about ${plural(left, 'minute')}` : 'Expiring now'}
    </Text>
  );
}

function CountdownQr({
  content,
  app,
}: {
  readonly content: string;
  readonly app: string;
}): ReactNode {
  const share = qrShareLeft(useProviderLink('tuya'), useMinute());
  const box = { width: RING_SIZE, height: RING_SIZE };
  return (
    <View style={box} className="items-center justify-center self-center">
      {share === null ? null : (
        <Arc
          value={share}
          size={RING_SIZE}
          thickness={RING_THICKNESS}
          colour={share > LOW_SHARE ? 'primary' : 'warning'}
          overlay
        />
      )}
      <QrCode text={content} size={QR_SIZE} label={`Sign-in code for ${app}`} />
    </View>
  );
}

function ScanSteps(): ReactNode {
  return (
    <View className="gap-3">
      {SCAN_STEPS.map((step, index) => (
        <View key={step} className="flex-row items-center gap-3">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-2">
            <Text variant="caption">{String(index + 1)}</Text>
          </View>
          <Text variant="body" className="flex-1">
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ShownCode({
  app,
  content,
  onDifferentAccount,
}: {
  readonly app: string;
  readonly content: string;
  readonly onDifferentAccount: () => void;
}): ReactNode {
  const phone = useIsPhone();
  return (
    <Card title={`Scan with ${app}`} icon="qr">
      <View className={cn('gap-6', phone ? '' : 'flex-row items-center')}>
        <CountdownQr content={content} app={app} />
        <View className="min-w-0 flex-1 gap-4">
          <ScanSteps />
          <MinutesLeft />
          <View className="flex-row">
            <Button label="Use a different account" variant="text" onPress={onDifferentAccount} />
          </View>
        </View>
      </View>
    </Card>
  );
}

export function TuyaQr({
  app,
  content,
  onDifferentAccount,
}: {
  readonly app: string;
  readonly content: string;
  readonly onDifferentAccount: () => void;
}): ReactNode {
  const phone = useIsPhone();
  const [here, setHere] = useState(false);
  if (!phone || here) {
    return <ShownCode app={app} content={content} onDifferentAccount={onDifferentAccount} />;
  }
  return (
    <Card>
      <View className="items-center gap-4">
        <Icon name="monitor" size={40} tone="primary" />
        <Text variant="title-3" align="center">
          Open SmartEverything on your computer
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {`The code to scan with ${app} is waiting there.`}
        </Text>
        <MinutesLeft />
        <Button
          label="Show the code here"
          variant="text"
          onPress={() => {
            setHere(true);
          }}
        />
      </View>
    </Card>
  );
}
