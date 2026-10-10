import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { latestSyncOf, useActiveSources } from '../data/sources';
import { useHealthConnect } from '../data/use-health-connect';

function syncedText(at: string | null, now: number): string {
  return at === null ? 'Not synced yet' : `Synced ${relative(at, now)}`;
}

function SyncNowButton(): ReactNode {
  const controls = useHealthConnect();
  if (controls.status.data?.sdk !== 'available') {
    return null;
  }
  return (
    <Button
      label={controls.syncing ? 'Syncing…' : 'Sync now'}
      icon="refresh"
      loading={controls.busy === 'sync' || controls.syncing}
      onPress={controls.syncNow}
    />
  );
}

function SourceRows({ now }: { readonly now: number }): ReactNode {
  const sources = useActiveSources();
  if (sources.length === 0) {
    return null;
  }
  return (
    <List title="Phones" inset>
      {sources.map((source) => (
        <ListRow
          key={source.id}
          icon="smartphone"
          title={source.name}
          subtitle={source.last_error ?? syncedText(source.last_sync_at, now)}
          subtitleTone={source.last_error === null ? 'variant' : 'critical'}
        />
      ))}
    </List>
  );
}

function SyncSheet({
  open,
  onClose,
  now,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly now: number;
}): ReactNode {
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title="Health sync" detents={['fit']}>
      <View className="gap-4">
        {HEALTH_CONNECT_ON_DEVICE ? <SyncNowButton /> : null}
        <SourceRows now={now} />
        <List inset>
          <NavRow
            title="Fitness settings"
            icon="settings"
            onPress={() => {
              onClose();
              router.push(href.settings.page('health'));
            }}
          />
        </List>
      </View>
    </Sheet>
  );
}

export function SyncChip(): ReactNode {
  const now = useMinute();
  const sources = useActiveSources();
  const [open, setOpen] = useState(false);
  const failed = sources.some((source) => source.last_error !== null);
  const label = syncedText(latestSyncOf(sources), now);
  return (
    <>
      <Interactive
        label={`${label}, sync details`}
        onPress={() => {
          setOpen(true);
        }}
        className="h-control-h flex-row items-center gap-2 rounded-full bg-surface-2 px-4"
        layerClassName="rounded-full"
      >
        <Icon
          name={failed ? 'warning' : 'refresh'}
          size={16}
          tone={failed ? 'warning' : 'variant'}
        />
        <Text variant="label" tone="variant" numberOfLines={1}>
          {label}
        </Text>
      </Interactive>
      <SyncSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        now={now}
      />
    </>
  );
}
