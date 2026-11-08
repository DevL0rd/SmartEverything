import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { STATUS_FILL, type StatusTone } from '../../../components/tone';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMinute } from '../../../store/clock';
import { DemandRegion } from '../../../store/demand-region';
import { sameJson } from '../../../store/same-json';
import { useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { Ident } from '../../computers/card/card-parts';
import { useComputerPlaces } from '../../computers/data/computer-files';
import { useComputerSelect } from '../../computers/data/computer-metrics';
import { useComputerScopes } from '../../computers/data/computer-scopes';
import { useLastSeen } from '../../devices';
import { flattenPages, useDriveConflicts, useDriveSyncClients } from '../../nas/data';
import {
  filesLineOf,
  homeUsageOf,
  mountLineOf,
  osLineOf,
  seenTextOf,
  syncLineOf,
  type SyncLine,
} from './computers-model';

const DISKS = ['disks'] as const;

function StateDot({ tone }: { readonly tone: StatusTone | null }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        tone === null ? 'bg-on-surface-faint' : STATUS_FILL[tone],
      )}
    />
  );
}

function Fact({
  label,
  first = false,
  children,
}: {
  readonly label: string;
  readonly first?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'min-h-row-h flex-row items-center gap-3 py-2',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <Text variant="footnote" tone="variant" className="w-20 shrink-0">
        {label}
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

function LineFact({
  label,
  line,
  first = false,
}: {
  readonly label: string;
  readonly line: SyncLine;
  readonly first?: boolean;
}): ReactNode {
  return (
    <Fact label={label} first={first}>
      <StateDot tone={line.tone} />
      <Text variant="callout" numberOfLines={2} className="tabular min-w-0 flex-1">
        {line.text}
      </Text>
    </Fact>
  );
}

function TextFact({ label, text }: { readonly label: string; readonly text: string }): ReactNode {
  return (
    <Fact label={label}>
      <Text variant="callout" numberOfLines={2} className="tabular min-w-0 flex-1">
        {text}
      </Text>
    </Fact>
  );
}

function Head({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Ident device={device} size="m" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {osLineOf(device)}
        </Text>
      </View>
      <Badge
        label={device.online ? 'Online' : 'Offline'}
        tone={device.online ? 'positive' : 'neutral'}
      />
    </View>
  );
}

function HomeBar({ device, home }: { readonly device: Device; readonly home: string }): ReactNode {
  const usage = useComputerSelect(
    device.id,
    (parts) => (parts.disks === undefined ? null : homeUsageOf(parts.disks.disks, home)),
    sameJson,
  );
  if (usage === null) return null;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
          Home folder disk
        </Text>
        <Text
          variant="footnote"
          tone={usage.tone ?? 'variant'}
          numberOfLines={1}
          className="tabular"
        >
          {usage.line}
        </Text>
      </View>
      <ProgressBar
        progress={usage.share}
        colour={usage.tone ?? 'track'}
        label={`Home folder disk on ${device.label}`}
      />
    </View>
  );
}

function HomeUsage({ device }: { readonly device: Device }): ReactNode {
  const home = useComputerPlaces(device.id, true).data?.home;
  if (home === undefined) return null;
  return (
    <DemandRegion deviceId={device.id} topics={DISKS}>
      <HomeBar device={device} home={home} />
    </DemandRegion>
  );
}

function useSyncLine(device: Device): SyncLine {
  const clients = useDriveSyncClients();
  const conflicts = flattenPages(useDriveConflicts(null).data, (page) => page.items);
  return syncLineOf(device, clients, conflicts);
}

function Actions({
  device,
  files,
}: {
  readonly device: Device;
  readonly files: boolean;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {files ? (
        <Button
          label="Open Files"
          icon="folder"
          variant="tonal"
          grow
          href={href.settings.device(device.id, 'files')}
        />
      ) : null}
      <Button
        label="Sync details"
        icon="folderSync"
        variant={files ? 'outlined' : 'tonal'}
        grow
        href={href.drivePage('sync')}
      />
    </View>
  );
}

export function ComputerCard({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const placements = useRows('drive_placements');
  const allowed = useComputerScopes(device.id, true).data?.files;
  const seen = seenTextOf(device.online, useLastSeen(device.id, !device.online)?.at ?? null, now);
  const filesLine = filesLineOf(allowed);
  const files = allowed === true;
  return (
    <Card>
      <Head device={device} />
      <View>
        <LineFact label="Sync" line={useSyncLine(device)} first />
        <LineFact label="Drive" line={mountLineOf(device.id, placements)} />
        {seen === null ? null : <TextFact label="Last seen" text={seen} />}
        {filesLine === null ? null : <TextFact label="Its files" text={filesLine} />}
      </View>
      {device.online && files ? <HomeUsage device={device} /> : null}
      <Actions device={device} files={files} />
    </Card>
  );
}
