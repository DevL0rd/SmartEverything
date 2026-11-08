import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge, Dot } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { MetricStrip } from '../../../components/metric-strip';
import { Text } from '../../../components/text';
import { joinParts, plural } from '../../../format/text';
import { useMutationState } from '../../../store/mutation';
import { useDevice } from '../../../store/selectors';
import { osLineOf } from '../computers/computers-model';
import { MOUNT_LOG_HREF, SYNC_MOUNT_SETTINGS_HREF, sendPlacements } from './mount-actions';
import {
  mountPointsLineOf,
  mountTilesOf,
  tierWordOf,
  toggleBodiesOf,
  type ThisMount,
} from './mount-model';

const TILE_COLUMNS = { compact: 3, medium: 3, expanded: 3 } as const;

export const MOUNT_CARD_TITLE = 'Drive on this computer';

function Where({
  deviceId,
  mount,
}: {
  readonly deviceId: string;
  readonly mount: ThisMount;
}): ReactNode {
  const device = useDevice(deviceId);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" numberOfLines={2} className="tabular">
        {joinParts([
          device?.label ?? null,
          device === null ? null : osLineOf(device),
          mountPointsLineOf(mount),
        ])}
      </Text>
      <View className="flex-row items-center gap-2">
        {mount.line.tone === null ? null : <Dot tone={mount.line.tone} />}
        <Text
          variant="callout"
          tone={mount.line.tone === 'critical' ? 'critical' : 'default'}
          numberOfLines={2}
          className="min-w-0 flex-1"
        >
          {mount.line.text}
        </Text>
      </View>
    </View>
  );
}

function WriteBanner({ mount }: { readonly mount: ThisMount }): ReactNode {
  if (mount.readOnly) {
    return (
      <Banner
        tone="info"
        title="Read only for now"
        body="Save changes through Basic or the app. Editing on the drive arrives with write-back."
        wrapBody
      />
    );
  }
  if (mount.pendingUploads === 0) return null;
  return (
    <Banner
      tone="info"
      title={`${plural(mount.pendingUploads, 'change')} waiting to upload`}
      body="They stay on this computer until the hub has them, even after a restart."
      wrapBody
    />
  );
}

function StoppedBanner({ mount }: { readonly mount: ThisMount }): ReactNode {
  if (mount.stopped === null) return null;
  return (
    <Banner
      tone={mount.stopped.status.state === 'failed' ? 'critical' : 'warning'}
      title="Mount stopped"
      body={mount.stopped.status.reason ?? 'The drive is not mounted right now.'}
      wrapBody
      action={{ label: 'Show log', icon: 'fileText', href: MOUNT_LOG_HREF, variant: 'outlined' }}
    />
  );
}

function ToggleButton({ mount }: { readonly mount: ThisMount }): ReactNode {
  const mutation = useMutationState();
  const next = !mount.enabled;
  const bodies = toggleBodiesOf(mount.placements, next);
  if (bodies.length === 0) return null;
  return (
    <Button
      label={next ? 'Mount' : 'Unmount'}
      spoken={next ? 'Mount the drive on this computer' : 'Unmount the drive on this computer'}
      icon={next ? 'play' : 'square'}
      variant="outlined"
      loading={mutation.busy}
      onPress={() => {
        mutation.run(() => sendPlacements(bodies, 'mount.this_computer_set'), {
          failure: next ? 'The drive was not mounted' : 'The drive was not unmounted',
          label: 'drive.mount.toggle',
        });
      }}
    />
  );
}

function Actions({
  deviceId,
  mount,
}: {
  readonly deviceId: string;
  readonly mount: ThisMount;
}): ReactNode {
  const point = mount.placements[0]?.localPath ?? null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {mount.enabled && point !== null ? (
        <Button
          label="Open in Files"
          icon="folder"
          grow
          href={href.settings.device(deviceId, 'files', { path: point })}
        />
      ) : null}
      <Button
        label="Mount settings"
        icon="settings"
        variant="tonal"
        href={SYNC_MOUNT_SETTINGS_HREF}
      />
      <ToggleButton mount={mount} />
    </View>
  );
}

function NotMounted(): ReactNode {
  return (
    <Card title={MOUNT_CARD_TITLE} icon="hardDrive">
      <Text variant="callout" tone="variant">
        The drive is not mounted here. Open a library folder, choose Use on a computer and pick
        Mounted only to see it in your file manager without copying it.
      </Text>
      <View className="flex-row">
        <Button label="Open My Drive" icon="folder" variant="tonal" href={href.drive()} />
      </View>
    </Card>
  );
}

export function MountCard({
  deviceId,
  mount,
}: {
  readonly deviceId: string;
  readonly mount: ThisMount;
}): ReactNode {
  if (mount.placements.length === 0) return <NotMounted />;
  const tier = tierWordOf(mount.tier, mount.readOnly);
  return (
    <Card
      title={MOUNT_CARD_TITLE}
      icon="hardDrive"
      {...(tier === null ? {} : { action: <Badge label={tier} tone="primary" /> })}
    >
      <Where deviceId={deviceId} mount={mount} />
      <StoppedBanner mount={mount} />
      {mount.enabled ? <MetricStrip items={mountTilesOf(mount)} columns={TILE_COLUMNS} /> : null}
      {mount.enabled ? <WriteBanner mount={mount} /> : null}
      <Actions deviceId={deviceId} mount={mount} />
    </Card>
  );
}
