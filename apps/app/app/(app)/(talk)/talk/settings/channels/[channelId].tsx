import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { href } from '../../../../../../src/app-shell/hrefs';

export default function TalkChannelSettingsRoute(): ReactNode {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <Redirect href={href.settings.talkChannel(channelId)} />;
}
