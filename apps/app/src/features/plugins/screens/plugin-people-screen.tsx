import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { PluginPerson, PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { plural } from '../../../format/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { usePluginPeopleActions } from '../data/plugin-people-actions';
import { usePluginPeople } from '../data/plugin-queries';
import { PersonSheet, type PersonRequest } from './plugin-person-sheet';
import { MissingPlugin, usePluginParam } from './plugin-screen';

function PersonRow({
  person,
  onEdit,
}: {
  readonly person: PluginPerson;
  readonly onEdit: () => void;
}): ReactNode {
  return (
    <ListRow
      title={person.name}
      subtitle={person.external_id}
      onPress={onEdit}
      chevron
      trailing={
        <Badge
          label={person.status === 'owner' ? 'Owner' : 'Approved'}
          tone={person.status === 'owner' ? 'primary' : 'neutral'}
        />
      }
    />
  );
}

function People({
  row,
  open,
}: {
  readonly row: PluginRow;
  readonly open: (request: PersonRequest) => void;
}): ReactNode {
  const people = usePluginPeople(row);
  if (people.isError) {
    return <ErrorState error={people.error} retry={() => void people.refetch()} />;
  }
  if (people.data === undefined) {
    return <Skeleton shape="block" className="mx-gutter h-40" />;
  }
  if (people.data.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Nobody yet"
        body={`Add the people who may ask ${row.manifest.name} to act for you.`}
      />
    );
  }
  return (
    <VirtualList
      sections={[
        { key: 'people', title: plural(people.data.length, 'person', 'people'), data: people.data },
      ]}
      keyOf={(person) => person.external_id}
      renderItem={(person) => (
        <PersonRow
          person={person}
          onEdit={() => {
            open({ person, row });
          }}
        />
      )}
      header={
        <View className="px-gutter pt-2">
          <Text variant="footnote" tone="variant">
            Approved people can ask {row.manifest.name} to act for you. Only you can change this
            list, here in the app.
          </Text>
        </View>
      }
    />
  );
}

function Page({ row }: { readonly row: PluginRow }): ReactNode {
  const [request, setRequest] = useState<PersonRequest | null>(null);
  const actions = usePluginPeopleActions(row);
  return (
    <SettingsFrame
      page="plugins"
      title="People"
      detail
      scroll={false}
      trail={[{ label: row.manifest.name, href: href.pluginSettings(row.id) }]}
      primaryAction={{
        label: 'Add',
        icon: 'plus',
        onPress: () => {
          setRequest({ person: null, row });
        },
      }}
    >
      <View className="w-full max-w-reading flex-1 self-center">
        <People row={row} open={setRequest} />
      </View>
      <PersonSheet
        request={request}
        actions={actions}
        onClose={() => {
          setRequest(null);
        }}
      />
    </SettingsFrame>
  );
}

export function PluginPeopleScreen({
  pluginId,
}: {
  readonly pluginId: string | undefined;
}): ReactNode {
  const row = usePluginParam(pluginId);
  return row?.manifest.permissions.inbound === true ? <Page row={row} /> : <MissingPlugin />;
}
