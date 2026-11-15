import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { useIsOwner } from '../../../store/selectors';
import { ChannelPanel } from '../components/channel-panel';
import { useTalkChannel } from '../data/talk-data';
import { useTalkSections } from './talk-sections';

const PARAMS = z.object({ channelId: z.string().min(1) });

function Missing({ channelId }: { readonly channelId: string | null }): ReactNode {
  const sections = useTalkSections(channelId);
  return (
    <PageShell title="Walkie-talkie" {...(sections === undefined ? {} : { sections })}>
      <EmptyState
        compact
        icon="radio"
        title="Channel not found"
        body="It may have been deleted."
        action={
          <View className="items-start">
            <Button label="All channels" href={href.talk()} />
          </View>
        }
      />
    </PageShell>
  );
}

function Opened({ channelId }: { readonly channelId: string }): ReactNode {
  const channel = useTalkChannel(channelId);
  const owner = useIsOwner();
  const sections = useTalkSections(channelId);
  if (channel === null) {
    return <Missing channelId={channelId} />;
  }
  return (
    <PageShell
      title={channel.name}
      {...(owner
        ? {
            settings: {
              href: href.settings.talkChannel(channel.id),
              label: 'Channel settings',
            },
          }
        : {})}
      {...(sections === undefined ? {} : { sections })}
    >
      <ChannelPanel channel={channel} split />
    </PageShell>
  );
}

export function ChannelScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Opened channelId={params.data.channelId} />
  ) : (
    <Missing channelId={null} />
  );
}
