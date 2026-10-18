import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { MasterDetail } from '../../../components/master-detail';
import { PageHeader } from '../../../components/page-header';
import { Text } from '../../../components/text';
import { Screen } from '../../../components/screen';
import { Section } from '../../../components/section';
import { useSizeClass } from '../../../design/size-class';
import { useIsOwner } from '../../../store/selectors';
import { ChannelCard } from '../components/channel-card';
import { ChannelPanel } from '../components/channel-panel';
import { DeviceStatus } from '../components/device-status';
import { chooseTalkChannel, useTalkChannelId } from '../data/talk-channel';
import { useMyChannels, useTalkChannel, useTalkChannels } from '../data/talk-data';
import type { TalkChannelRow } from '@smarteverything/domain';

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

function ChannelGroup({
  title,
  channels,
  selected,
  open,
}: {
  readonly title: string;
  readonly channels: readonly TalkChannelRow[];
  readonly selected: string | null;
  readonly open: (channelId: string) => void;
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
            selected={channel.id === selected}
            onOpen={() => {
              open(channel.id);
            }}
          />
        ))}
      </View>
    </Section>
  );
}

function ChannelLists({ split }: { readonly split: boolean }): ReactNode {
  const all = useTalkChannels();
  const mine = useMyChannels();
  const selected = useTalkChannelId();
  const others = all.filter((channel) => !mine.some((own) => own.id === channel.id));
  const open = (channelId: string): void => {
    if (split) {
      chooseTalkChannel(channelId);
    } else {
      router.push(href.talkChannel(channelId));
    }
  };
  if (all.length === 0) {
    return <NoChannels />;
  }
  return (
    <>
      <ChannelGroup
        title="Your channels"
        channels={mine}
        selected={split ? selected : null}
        open={open}
      />
      <ChannelGroup title="Other channels" channels={others} selected={null} open={open} />
    </>
  );
}

function ListScreen(): ReactNode {
  return (
    <Screen
      header={<PageHeader settings={mainPageSettings('talk')} title="Walkie-talkie" />}
      maxWidth="reading"
    >
      <DeviceStatus />
      <ChannelLists split={false} />
    </Screen>
  );
}

function Master(): ReactNode {
  return (
    <ScrollView contentContainerClassName="gap-section-gap px-4 pb-6 pt-safe-offset-6">
      <View className="flex-row items-center gap-2 px-2">
        <Text variant="title-1" accessibilityRole="header" className="flex-1">
          Walkie-talkie
        </Text>
      </View>
      <DeviceStatus />
      <ChannelLists split />
    </ScrollView>
  );
}

function SelectedChannel(): ReactNode {
  const channel = useTalkChannel(useTalkChannelId());
  if (channel === null) {
    return (
      <Screen
        header={<PageHeader settings={mainPageSettings('talk')} title="Channel" back={false} />}
        maxWidth="reading"
      >
        <EmptyState
          icon="radio"
          title="Choose a channel"
          body="Open one from the list to talk on it here."
        />
      </Screen>
    );
  }
  return (
    <Screen
      header={<PageHeader settings={mainPageSettings('talk')} title={channel.name} back={false} />}
      maxWidth="reading"
    >
      <ChannelPanel channel={channel} />
    </Screen>
  );
}

export function TalkScreen(): ReactNode {
  const { split } = useSizeClass();
  return split ? (
    <MasterDetail master={<Master />} detail={<SelectedChannel />} masterWidth="popover" />
  ) : (
    <ListScreen />
  );
}
