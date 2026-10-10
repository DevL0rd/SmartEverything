import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ROLES, type ClientRow, type Role } from '@smarteverything/domain';
import { changeClientRole, removeClient } from '../../../api/settings';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useMinute } from '../../../store/clock';
import { useRows, useSession } from '../../../store/selectors';
import { ClientProfile } from './client-profile';
import { ROLE_HELP, ROLE_LABEL, clientViews, platformIcon, type ClientView } from './clients';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({
      message,
      error,
      tone: 'critical',
    });
  };
}

async function unpair(client: ClientRow, close: () => void): Promise<void> {
  const accepted = await confirm({
    title: `Unpair ${client.name}?`,
    body: 'It loses access right away. You can pair it again later.',
    confirmLabel: 'Unpair',
    tone: 'destructive',
  });
  if (accepted) {
    await removeClient(client.id);
    close();
  }
}

function RoleChoice({ client }: { readonly client: ClientRow }): ReactNode {
  const [role, setRole] = useState<Role>(client.role);
  return (
    <View className="gap-2">
      <Segmented
        label="Role"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(next) => {
          setRole(next);
          changeClientRole(client.id, next).catch((error: unknown) => {
            setRole(client.role);
            failed('The role was not changed')(error);
          });
        }}
      />
      <Text variant="footnote" tone="variant">
        {ROLE_HELP[role]}
      </Text>
    </View>
  );
}

function ClientSheet({
  view,
  onClose,
}: {
  readonly view: ClientView;
  readonly onClose: () => void;
}): ReactNode {
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
            unpair(view.client, onClose).catch(failed(`${view.client.name} was not unpaired`));
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
  const selected = views.find((view) => view.client.id === open) ?? null;
  return (
    <>
      <List inset footer="Owners can change settings and pair other phones.">
        {views.map((view) => (
          <ListRow
            key={view.client.id}
            title={view.client.name}
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
