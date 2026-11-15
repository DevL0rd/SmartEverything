import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { TalkChannelRow } from '@smarteverything/domain';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { Section } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { ChannelCard } from '../components/channel-card';
import { ChannelPanel } from '../components/channel-panel';
import { DeviceStatus } from '../components/device-status';
import { useTalkChannelId } from '../data/talk-channel';
import { useMyChannels, useTalkChannel, useTalkChannels } from '../data/talk-data';
import { useTalkSections } from './talk-sections';

const TITLE = 'Walkie-talkie';

function NoChannels(): ReactNode {
  const owner = useIsOwner();
  return (
    <EmptyState
      icon="radio"
      title="No channels yet"
      body={
        owner
          ? 'Make a channel, add phones, computers and cameras, then hold to talk.'
          : 'Ask whoever set up your home to make a channel.'
      }
      action={
        owner ? (
          <Button label="Create a channel" href={href.settings.talkChannel('new')} />
        ) : undefined
      }
    />
  );
}

function openChannel(channelId: string): void {
  router.push(href.talkChannel(channelId));
}

function ChannelGroup({
  title,
  channels,
}: {
  readonly title: string;
  readonly channels: readonly TalkChannelRow[];
}): ReactNode {
  if (channels.length === 0) {
    return null;
  }
  return (
    <Section title={title}>
      <View className="gap-2">
        {channels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            onOpen={() => {
              openChannel(channel.id);
            }}
          />
        ))}
      </View>
    </Section>
  );
}

function ChannelLists(): ReactNode {
  const all = useTalkChannels();
  const mine = useMyChannels();
  const others = all.filter((channel) => !mine.some((own) => own.id === channel.id));
  if (all.length === 0) {
    return <NoChannels />;
  }
  return (
    <>
      <ChannelGroup title="Your channels" channels={mine} />
      <ChannelGroup title="Other channels" channels={others} />
    </>
  );
}

function ListPage(): ReactNode {
  return (
    <PageShell title={TITLE} settings={mainPageSettings('talk')} width="reading">
      <DeviceStatus />
      <ChannelLists />
    </PageShell>
  );
}

function OverviewPage({
  sections,
  channelId,
}: {
  readonly sections: ShellSections;
  readonly channelId: string | null;
}): ReactNode {
  const channel = useTalkChannel(channelId);
  return (
    <PageShell
      title={TITLE}
      {...(channel === null ? {} : { subtitle: channel.name })}
      settings={mainPageSettings('talk')}
      sections={sections}
    >
      {channel === null ? (
        <>
          <DeviceStatus />
          <EmptyState
            icon="radio"
            title="Choose a channel"
            body="Open one from the list to talk on it here."
          />
        </>
      ) : (
        <ChannelPanel channel={channel} split />
      )}
    </PageShell>
  );
}

export function TalkScreen(): ReactNode {
  const channelId = useTalkChannelId();
  const sections = useTalkSections(channelId);
  return sections === undefined ? (
    <ListPage />
  ) : (
    <OverviewPage sections={sections} channelId={channelId} />
  );
}
