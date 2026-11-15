import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MenuItem } from '../../../components/menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Skeleton } from '../../../components/skeleton';

export function GroupLoading({ title }: { readonly title: string }): ReactNode {
  return (
    <PageShell title={title} subtitle="Loading…">
      <View className="gap-3">
        <Skeleton shape="tile" className="h-56" />
        <Skeleton shape="block" className="h-14" />
        <Skeleton shape="block" className="h-10" />
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} shape="block" className="h-12" />
        ))}
      </View>
    </PageShell>
  );
}

export function GroupGone({ room }: { readonly room: boolean }): ReactNode {
  return (
    <PageShell title={room ? 'Room lights' : 'Group'}>
      <EmptyState
        icon="bulb"
        title={room ? 'This room no longer exists' : 'This group was removed'}
        body={room ? 'Its lights keep their settings.' : 'Its devices keep their settings.'}
        action={<Button label="All devices" href={href.devices()} variant="tonal" />}
      />
    </PageShell>
  );
}

export function GroupEmpty({
  title,
  roomName,
  menu,
  onAdd,
}: {
  readonly title: string;
  readonly roomName: string | null;
  readonly menu: readonly MenuItem[];
  readonly onAdd: () => void;
}): ReactNode {
  return (
    <PageShell title={title} subtitle="No devices" overflow={menu}>
      {roomName !== null ? (
        <EmptyState
          icon="bulb"
          title={`No lights in ${roomName}`}
          body="Choose this room for a light in its settings."
          action={<Button label="All devices" href={href.devices()} variant="tonal" />}
        />
      ) : (
        <EmptyState
          icon="bulb"
          title="No devices in this group"
          body="Add lights or plugs to control them together."
          action={<Button label="Add devices" onPress={onAdd} />}
        />
      )}
    </PageShell>
  );
}
