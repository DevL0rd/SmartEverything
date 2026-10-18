import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useRows, useSession } from '../../../store/selectors';
import { ClientSheet } from './members-block';
import { clientViews, platformIcon, type ClientView } from './clients';

function DeviceRows({
  views,
  onOpen,
}: {
  readonly views: readonly ClientView[];
  readonly onOpen: (clientId: string) => void;
}): ReactNode {
  return views.map((view) => (
    <ListRow
      key={view.client.id}
      title={view.client.name}
      subtitle={view.detail}
      icon={platformIcon(view.client.platform)}
      {...(view.removable
        ? {
            chevron: true,
            onPress: (): void => {
              onOpen(view.client.id);
            },
          }
        : {})}
    />
  ));
}

export function PersonDevices({ profileId }: { readonly profileId: string }): ReactNode {
  const router = useRouter();
  const clients = useRows('clients');
  const me = useSession().client.id;
  const now = useMinute();
  const [open, setOpen] = useState<string | null>(null);
  const views = clientViews(
    clients.filter((client) => client.profile_id === profileId),
    me,
    now,
  );
  const selected = views.find((view) => view.client.id === open) ?? null;
  return (
    <>
      <List
        title="Devices"
        caption={plural(views.length, 'device')}
        footer="A phone paired for this person opens on their chats and health data."
      >
        <DeviceRows views={views} onOpen={setOpen} />
        <ListRow
          title="Pair a phone for this person"
          icon="qr"
          onPress={() => {
            router.push(href.pairPhone(profileId));
          }}
        />
      </List>
      {selected === null ? null : (
        <ClientSheet
          view={selected}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
