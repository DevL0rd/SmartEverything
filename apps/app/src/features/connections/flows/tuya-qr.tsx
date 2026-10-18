import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { QrCode } from '../../../components/qr-code';
import { Text } from '../../../components/text';
import { useIsPhone } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useProviderLink } from '../../../store/selectors';
import { qrMinutesLeft } from '../model/qr-expiry';

function MinutesLeft(): ReactNode {
  const left = qrMinutesLeft(useProviderLink('tuya'), useMinute());
  if (left === null) {
    return null;
  }
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
  const phone = useIsPhone();
  const [here, setHere] = useState(false);
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
