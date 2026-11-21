import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ROLES, type ClientRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useMinute } from '../../../store/clock';
import type { EntityStore } from '../../../store/entity-store';
import { unpairClient, writeClientRole } from '../../../store/home-writes';
import { useRows, useSession } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { ClientProfile } from './client-profile';
import { ROLE_HELP, ROLE_LABEL, clientViews, platformIcon, type ClientView } from './clients';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

async function unpair(store: EntityStore, client: ClientRow, close: () => void): Promise<void> {
  const accepted = await confirm({
    title: `Unpair ${client.name}?`,
    body: 'It loses access right away. You can pair it again later.',
    confirmLabel: 'Unpair',
    tone: 'destructive',
  });
  if (!accepted) return;
  close();
  await unpairClient(store, client);
}

function RoleChoice({ client }: { readonly client: ClientRow }): ReactNode {
  const store = useEntityStore();
  return (
    <View className="gap-2">
      <Segmented
        label="Role"
        options={ROLE_OPTIONS}
        value={client.role}
        onChange={(next) => {
          writeClientRole(store, client, next).catch(notifyFailure('The role was not changed'));
        }}
      />
      <Text variant="footnote" tone="variant">
        {ROLE_HELP[client.role]}
      </Text>
    </View>
  );
}

export function ClientSheet({
  view,
  onClose,
}: {
  readonly view: ClientView;
  readonly onClose: () => void;
}): ReactNode {
  const store = useEntityStore();
  return (
    <Sheet
      open
      onClose={onClose}
      title={view.client.name}
      detents={['fit']}
      footer={
        <Button
          label="Unpair"
          icon="trash"
          variant="destructive"
          onPress={() => {
            unpair(store, view.client, onClose).catch(
              notifyFailure(`${view.client.name} was not unpaired`),
            );
          }}
        />
      }
    >
      <View className="gap-4">
        <Text variant="callout" tone="variant">
          {view.detail}
        </Text>
        <RoleChoice client={view.client} />
        <ClientProfile client={view.client} label="Profile" />
      </View>
    </Sheet>
  );
}

export function MembersBlock(): ReactNode {
  const clients = useRows('clients');
  const me = useSession().client.id;
  const now = useMinute();
  const [open, setOpen] = useState<string | null>(null);
  const views = clientViews(clients, me, now);
  if (views.length === 0) {
    return (
      <EmptyState
        icon="smartphone"
        title="No paired devices"
        body="Pair a device to connect it to this home."
        compact
      />
    );
  }
  const selected = views.find((view) => view.client.id === open) ?? null;
  return (
    <>
      <List inset footer="Owners can change settings and pair other devices.">
        {views.map((view) => (
          <ListRow
            key={view.client.id}
            title={view.client.name}
            wrapTitle
            subtitle={view.detail}
            icon={platformIcon(view.client.platform)}
            {...(view.removable
              ? {
                  chevron: true,
                  onPress: (): void => {
                    setOpen(view.client.id);
                  },
                }
              : {})}
          />
        ))}
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
