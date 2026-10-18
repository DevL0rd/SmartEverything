import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { doingWordOf, spokenPhone, type FaceTone } from '../model/face-model';
import { useDeviceCommand } from './face-controls';
import type { PhoneFaceData } from './use-phone-face';

function Dot({ tone }: { readonly tone: FaceTone }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 rounded-full',
        tone === 'neutral' ? 'bg-on-surface-faint' : STATUS_FILL[tone],
      )}
    />
  );
}

function StateLabel({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { readings, online, word } = data;
  const label = doingWordOf(readings.doing, online) ?? word.word;
  return (
    <View className="shrink-0 flex-row items-center gap-1.5" pointerEvents="none">
      <Dot tone={online ? word.tone : 'neutral'} />
      <Text variant="footnote" tone={online ? 'default' : 'variant'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Chips({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { view } = data.access;
  if (view.here) return <Badge label="This phone" tone="primary" icon="smartphone" />;
  return view.own ? <Badge label="Your phone" tone="neutral" icon="user" /> : null;
}

function useMenuItems(data: PhoneFaceData): readonly MenuItem[] {
  const { device, readings, access } = data;
  const router = useRouter();
  const send = useDeviceCommand(device);
  const items: MenuItem[] = [
    {
      label: 'Open phone page',
      icon: 'smartphone',
      onPress: (): void => {
        router.push(href.device(device));
      },
    },
  ];
  if (access.view.canRing) {
    const stop =
      readings.ringing === true && device.capabilities.some((c) => c.key === 'stop_ring');
    items.push({
      label: stop ? 'Stop ringing' : 'Ring',
      icon: 'siren',
      onPress: (): void => {
        send(stop ? 'stop_ring' : 'ring', null);
      },
    });
  }
  if (access.view.canAct && access.torch !== 'unsupported') {
    const on = readings.flashlight === 'on';
    items.push({
      label: on ? 'Turn flashlight off' : 'Turn flashlight on',
      icon: 'flashlight',
      onPress: (): void => {
        send('flashlight', on ? 'off' : 'on');
      },
    });
  }
  return items;
}

export function FaceHeader({
  data,
  chips,
}: {
  readonly data: PhoneFaceData;
  readonly chips: boolean;
}): ReactNode {
  const items = useMenuItems(data);
  return (
    <View className="h-7 flex-row items-center gap-2" pointerEvents="box-none">
      <View
        accessible
        accessibilityLabel={`${data.device.label}, ${spokenPhone(data.readings, data.online)}`}
        className="min-w-0 flex-1 flex-row items-center gap-2"
        pointerEvents="none"
      >
        <Text variant="body-strong" numberOfLines={1} className="shrink">
          {data.device.label}
        </Text>
        {chips ? <Chips data={data} /> : null}
      </View>
      <StateLabel data={data} />
      <View className="-my-3 -mr-2">
        <OverflowButton items={items} label={`${data.device.label} options`} />
      </View>
    </View>
  );
}
