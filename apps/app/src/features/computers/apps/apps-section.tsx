import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { ComputerApps, InstalledApp } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { PAGE_SIZE, ShowMore } from '../../../components/show-more';
import { Skeleton } from '../../../components/skeleton';
import { useCloseApp, useComputerApps, useOpenApp, useOpenWindows } from '../data/computer-windows';
import { matchingInstalled, runningIds, usedApps } from './apps-model';

interface Reach {
  readonly deviceId: string;
  readonly machine: string;
  readonly online: boolean;
}

function UsedList({
  reach,
  apps,
}: {
  readonly reach: Reach;
  readonly apps: ComputerApps;
}): ReactNode {
  const close = useCloseApp(reach.deviceId);
  const windows = useOpenWindows(reach.deviceId);
  const used = usedApps(apps, runningIds(windows, apps.focused?.id ?? null));
  if (used.length === 0) return <ReasonLine icon="info" text="Nothing has been used yet today." />;
  return (
    <List title="Apps used today">
      {used.map((app) => (
        <ListRow
          key={app.id}
          title={app.name}
          subtitle={app.line}
          icon="appWindow"
          trailing={
            app.running ? (
              <Button
                label="Close"
                variant="tonal"
                disabled={!reach.online}
                loading={close.isPending ? close.variables.id === app.id : false}
                onPress={() => {
                  close.mutate({ id: app.id, name: app.name });
                }}
              />
            ) : undefined
          }
        />
      ))}
    </List>
  );
}

function InstalledRows({
  reach,
  installed,
}: {
  readonly reach: Reach;
  readonly installed: readonly InstalledApp[];
}): ReactNode {
  const open = useOpenApp(reach.deviceId, reach.machine);
  const [limit, setLimit] = useState(PAGE_SIZE);
  return (
    <List title="Open an app" footer={`Installed on ${reach.machine}.`}>
      {installed.slice(0, limit).map((app) => (
        <ListRow
          key={app.id}
          title={app.name}
          {...(app.comment === null ? {} : { subtitle: app.comment })}
          icon="appWindow"
          trailing={
            <Button
              label="Open"
              variant="text"
              disabled={!reach.online}
              onPress={() => {
                open.mutate({ id: app.id, name: app.name });
              }}
            />
          }
        />
      ))}
      <ShowMore
        remaining={installed.length - limit}
        onPress={() => {
          setLimit(limit + PAGE_SIZE);
        }}
      />
    </List>
  );
}

function InstalledList({
  reach,
  apps,
}: {
  readonly reach: Reach;
  readonly apps: ComputerApps;
}): ReactNode {
  const [query, setQuery] = useState('');
  const installed = matchingInstalled(apps.installed, query);
  return (
    <View className="gap-2">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search installed apps"
        variant="field"
      />
      {installed.length === 0 ? (
        <EmptyState
          compact
          icon="search"
          title="No apps match"
          body={
            query.trim() === ''
              ? `Nothing is installed on ${reach.machine}.`
              : 'Try a shorter name.'
          }
        />
      ) : (
        <InstalledRows reach={reach} installed={installed} />
      )}
    </View>
  );
}

export function AppsSection(reach: Reach): ReactNode {
  const apps = useComputerApps(reach.deviceId, reach.online);
  if (apps.isError) {
    return (
      <ErrorState
        error={apps.error}
        retry={() => {
          background(apps.refetch(), 'apps.refetch_failed');
        }}
      />
    );
  }
  if (apps.data === undefined) return reach.online ? <Skeleton shape="block" /> : null;
  return (
    <View className="gap-5">
      <UsedList reach={reach} apps={apps.data} />
      <InstalledList reach={reach} apps={apps.data} />
    </View>
  );
}
