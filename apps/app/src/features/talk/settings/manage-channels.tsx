import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { plural } from '../../../format/text';
import { useRows } from '../../../store/selectors';
import { useTalkChannels } from '../data/talk-data';

export function ManageChannelsBlock(): ReactNode {
  const channels = useTalkChannels();
  const members = useRows('talk_members');
  if (channels.length === 0) {
    return (
      <EmptyState
        icon="radio"
        title="No channels yet"
        body="Make one for the family, a room or the cameras."
        action={<Button label="New channel" icon="plus" href={href.settings.talkChannel('new')} />}
      />
    );
  }
  return (
    <View className="gap-3">
      <List title="Channels" inset>
        {channels.map((channel) => (
          <NavRow
            key={channel.id}
            title={channel.name}
            icon={channel.icon}
            value={plural(
              members.filter((member) => member.channel_id === channel.id).length,
              'member',
            )}
            href={href.settings.talkChannel(channel.id)}
          />
        ))}
      </List>
      <View className="items-start">
        <Button
          label="New channel"
          icon="plus"
          variant="tonal"
          href={href.settings.talkChannel('new')}
        />
      </View>
    </View>
  );
}
