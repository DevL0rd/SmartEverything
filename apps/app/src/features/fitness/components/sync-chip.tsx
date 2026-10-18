import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute, useMinuteOf } from '../../../store/clock';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { latestSyncOf, useSources } from '../data/sources';
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

function SourceRows(): ReactNode {
  const sources = useSources();
  const now = useMinute();
  if (sources.length === 0) {
    return null;
  }
  return (
    <List title="Phones" inset>
      {sources.map((source) => (
        <ListRow
          key={source.client_id}
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
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title="Health sync" detents={['fit']}>
      <View className="gap-4">
        {HEALTH_CONNECT_ON_DEVICE ? <SyncNowButton /> : null}
        <SourceRows />
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

export function SyncChip({ compact = false }: { readonly compact?: boolean }): ReactNode {
  const sources = useSources();
  const [open, setOpen] = useState(false);
  const failed = sources.some((source) => source.last_error !== null);
  const latest = latestSyncOf(sources);
  const label = useMinuteOf((now) => syncedText(latest, now));
  const glyph = failed ? 'warning' : 'refresh';
  const show = (): void => {
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <IconButton
          icon={glyph}
          label={`${label}, sync details`}
          variant="tonal"
          tone={failed ? 'warning' : 'variant'}
          onPress={show}
        />
      ) : (
        <Interactive
          label={`${label}, sync details`}
          onPress={show}
          className="h-control-h flex-row items-center gap-2 rounded-full bg-surface-2 px-4"
          layerClassName="rounded-full"
        >
          <Icon name={glyph} size={16} tone={failed ? 'warning' : 'variant'} />
          <Text variant="label" tone="variant" numberOfLines={1}>
            {label}
          </Text>
        </Interactive>
      )}
      <SyncSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
