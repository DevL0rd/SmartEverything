import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { QrCode } from '../../../components/qr-code';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useProviderLink } from '../../../store/selectors';

const QR_LIFETIME_MS = 5 * 60_000;

function MinutesLeft(): ReactNode {
  const row = useProviderLink('tuya');
  const now = useMinute();
  if (row === null) {
    return null;
  }
  const left = Math.ceil((Date.parse(row.updated_at) + QR_LIFETIME_MS - now) / 60_000);
  return (
    <Text variant="footnote" tone="variant" align="center">
      {left > 0 ? `Expires in about ${plural(left, 'minute')}` : 'Expiring now'}
    </Text>
  );
}

function ShownCode({
  app,
  content,
}: {
  readonly app: string;
  readonly content: string;
}): ReactNode {
  return (
    <View className="items-center gap-4">
      <QrCode text={content} size={240} label={`Sign-in code for ${app}`} />
      <Text variant="body" align="center">
        {`Open ${app} → + → Scan, then confirm on your phone.`}
      </Text>
      <MinutesLeft />
    </View>
  );
}

export function TuyaQr({
  app,
  content,
}: {
  readonly app: string;
  readonly content: string;
}): ReactNode {
  const { idiom, width } = useSizeClass();
  const [here, setHere] = useState(false);
  const phone = idiom === 'touch' && (width === 'compact' || width === 'medium');
  if (!phone || here) {
    return <ShownCode app={app} content={content} />;
  }
  return (
    <View className="items-center gap-4 rounded-lg bg-surface-2 p-card-pad">
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
  );
}
