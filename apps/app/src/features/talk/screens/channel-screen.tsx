import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useIsOwner } from '../../../store/selectors';
import { ChannelPanel } from '../components/channel-panel';
import { useTalkChannel } from '../data/talk-data';

const PARAMS = z.object({ channelId: z.string().min(1) });

function Missing(): ReactNode {
  return (
    <Screen header={<PageHeader title="Walkie-talkie" />} maxWidth="reading">
      <EmptyState
        icon="radio"
        title="Channel not found"
        body="It may have been deleted."
        action={<Button label="All channels" href={href.talk()} />}
      />
    </Screen>
  );
}

function Opened({ channelId }: { readonly channelId: string }): ReactNode {
  const channel = useTalkChannel(channelId);
  const owner = useIsOwner();
  if (channel === null) {
    return <Missing />;
  }
  const actions: HeaderAction[] = owner
    ? [{ icon: 'settings', label: 'Channel settings', href: href.settings.talkChannel(channel.id) }]
    : [];
  return (
    <Screen header={<PageHeader title={channel.name} actions={actions} />} maxWidth="reading">
      <ChannelPanel channel={channel} />
    </Screen>
  );
}

export function ChannelScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? <Opened channelId={params.data.channelId} /> : <Missing />;
}
