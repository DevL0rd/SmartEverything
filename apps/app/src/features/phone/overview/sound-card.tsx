import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { DndButton, MediaSlider, MemberLine, RingerSegmented } from '../card/face-controls';
import { NowPlayingRow } from '../card/media-row';
import { usePhoneFace } from '../card/use-phone-face';

export function SoundCard({ device }: { readonly device: Device }): ReactNode {
  const { controls, access, online } = usePhoneFace(device);
  const blocked = access.dnd === 'needs_permission';
  return (
    <Card
      title="Sound"
      icon="volume"
      action={
        <Button label="Open" variant="text" href={href.settings.device(device.id, 'sound')} />
      }
    >
      {access.view.canAct ? (
        <View className="gap-3" pointerEvents={online ? 'auto' : 'none'}>
          <View className="flex-row flex-wrap items-center gap-2">
            <RingerSegmented device={device} ringerMode={controls.ringerMode} dnd={controls.dnd} />
            <DndButton device={device} on={controls.dnd} blocked={blocked} />
            {blocked ? <Badge label="Needs access" tone="warning" icon="warning" /> : null}
          </View>
          <MediaSlider device={device} volume={controls.mediaVolume} label />
        </View>
      ) : (
        <MemberLine device={device} />
      )}
      {access.view.own ? (
        <NowPlayingRow device={device} playing={controls.playing} title={controls.title} wide />
      ) : (
        <Text variant="footnote" tone="variant">
          {controls.playing ? 'Playing' : 'Nothing playing'}
        </Text>
      )}
    </Card>
  );
}
