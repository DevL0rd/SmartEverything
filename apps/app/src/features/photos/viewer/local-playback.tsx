import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import { Text } from '../../../components/text';
import { usePlaybackLive, useVideoModule, type VideoModule } from './live-photo';

function Playback({
  module,
  uri,
}: {
  readonly module: VideoModule;
  readonly uri: string;
}): ReactNode {
  const player = module.useVideoPlayer({ uri, contentType: 'progressive' });
  const live = usePlaybackLive();
  const [failed, setFailed] = useState(false);
  useEventListener(player, 'statusChange', (event) => {
    if (event.status === 'error') setFailed(true);
  });
  useEffect(() => {
    if (!live) player.pause();
  }, [live, player]);
  if (failed) return <Text>This video could not be played on this device.</Text>;
  const { VideoView } = module;
  return (
    <View className="min-h-0 flex-1">
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function LocalPlayback({ uri }: { readonly uri: string }): ReactNode {
  const module = useVideoModule(true);
  if (module === null) return <Text>Loading video…</Text>;
  if (module === 'failed') return <Text>This device could not load the video player.</Text>;
  return <Playback module={module} uri={uri} />;
}
