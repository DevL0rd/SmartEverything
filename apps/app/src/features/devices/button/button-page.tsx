import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import type { ButtonGesture } from '../../device-visuals';
import { DeviceStage } from '../detail/device-stage';
import { DeviceLog } from '../log/device-log';
import { PressMenu } from './press-menu';
import { PressStrip } from './press-strip';
import {
  GESTURES,
  GESTURE_WORDS,
  meaningFor,
  phraseOf,
  type Meaning,
  type WeekCounts,
} from './press-model';
import { useButtonView } from './use-button-view';

function countText(count: number): string {
  return count === 0 ? 'None this week' : `${String(count)}× this week`;
}

function GestureRow({
  gesture,
  meaning,
  count,
}: {
  readonly gesture: ButtonGesture;
  readonly meaning: readonly Meaning[];
  readonly count: number;
}): ReactNode {
  const first = meaning[0];
  const doing = meaning.map((entry) => phraseOf(entry.name)).join(' · ');
  return (
    <ListRow
      title={GESTURE_WORDS[gesture]}
      subtitle={first === undefined ? 'Does nothing yet' : doing}
      caption={countText(count)}
      icon="circle"
      {...(first === undefined ? {} : { href: href.automation(first.automationId), chevron: true })}
      label={`${GESTURE_WORDS[gesture]}, ${first === undefined ? 'does nothing yet' : doing}, ${countText(count)}`}
    />
  );
}

function Gestures({
  meaning,
  week,
}: {
  readonly meaning: readonly Meaning[];
  readonly week: WeekCounts;
}): ReactNode {
  return (
    <View>
      {GESTURES.map((gesture) => (
        <GestureRow
          key={gesture}
          gesture={gesture}
          meaning={meaningFor(meaning, gesture)}
          count={week[gesture]}
        />
      ))}
    </View>
  );
}

export function ButtonHero({ device }: { readonly device: Device }): ReactNode {
  const view = useButtonView(device.id);
  return (
    <Card>
      <View className="gap-4 py-2">
        <View className="items-center">
          <DeviceStage device={device} />
        </View>
        <PressStrip segments={view.strip} window={view.window} height={28} />
        <Gestures meaning={view.meaning} week={view.week} />
        <View className="flex-row">
          <PressMenu deviceId={device.id} meaning={view.meaning} />
        </View>
        {device.online ? null : (
          <Text variant="footnote" tone="variant">
            The hub that hears this button is offline.
          </Text>
        )}
      </View>
    </Card>
  );
}

export function DeviceLogCard({ device }: { readonly device: Device }): ReactNode {
  return (
    <Card title="Activity" icon="activity">
      <DeviceLog deviceId={device.id} />
    </Card>
  );
}
