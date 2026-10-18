import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ROLES, type ClientRow } from '@smarteverything/domain';
import { changeClientRole, removeClient } from '../../../api/settings';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useMinute } from '../../../store/clock';
import { useRows, useSession } from '../../../store/selectors';
import { ClientProfile } from './client-profile';
import {
  ROLE_HELP,
  ROLE_LABEL,
  clientViews,
  livePending,
  platformIcon,
  shownRole,
  type ClientView,
  type PendingRole,
} from './clients';

import { trackSetting } from '../settings-log';
const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

async function unpair(client: ClientRow, close: () => void): Promise<void> {
  const accepted = await confirm({
    title: `Unpair ${client.name}?`,
    body: 'It loses access right away. You can pair it again later.',
    confirmLabel: 'Unpair',
    tone: 'destructive',
  });
  if (accepted) {
    await trackSetting('client.unpair', { clientId: client.id }, () => removeClient(client.id));
    close();
  }
}

function RoleChoice({ client }: { readonly client: ClientRow }): ReactNode {
  const [pending, setPending] = useState<PendingRole | null>(null);
  const live = livePending(client.role, pending);
  if (live !== pending) {
    setPending(live);
  }
  const role = shownRole(client.role, live);
  return (
    <View className="gap-2">
      <Segmented
        label="Role"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(next) => {
          setPending({ from: client.role, to: next });
          trackSetting(
            'client.role_change',
            { clientId: client.id, from: client.role, to: next },
            () => changeClientRole(client.id, next),
          ).catch((error: unknown) => {
            setPending(null);
            notifyFailure('The role was not changed')(error);
          });
        }}
      />
      <Text variant="footnote" tone="variant">
        {ROLE_HELP[role]}
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
            unpair(view.client, onClose).catch(
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
