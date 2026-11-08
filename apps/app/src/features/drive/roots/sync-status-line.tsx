import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot } from '@smarteverything/domain';
import { Arc } from '../../../components/charts';
import { DotStrip } from '../../../components/dot-strip';
import type { StatusTone } from '../../../components/tone';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { flattenPages, useDriveConflicts, useDriveSyncClients } from '../../nas/data';
import {
  syncLineOf,
  type SyncComputer,
  type SyncComputerDot,
  type SyncLine,
  type SyncLineTone,
} from './root-card-model';

const RING_SIZE = 16;
const RING_THICKNESS = 3;

const RING_COLOUR: Readonly<Record<SyncLineTone, ColourRole>> = {
  positive: 'positive',
  info: 'info',
  warning: 'warning',
  critical: 'critical',
  offline: 'track',
};

const SENTENCE_TONE = {
  positive: 'default',
  info: 'default',
  warning: 'warning',
  critical: 'critical',
  offline: 'variant',
} as const;

type ToneColours = Readonly<Record<StatusTone, string>>;

export function computersIn(
  state: StoreState,
  deviceIds: readonly string[],
): readonly SyncComputer[] {
  return deviceIds.flatMap((deviceId) => {
    const device = state.tables.devices.byId[deviceId];
    return device === undefined ? [] : [{ deviceId, name: device.label, online: device.online }];
  });
}

export function useRootSyncLine(root: DriveRoot): SyncLine | null {
  const clients = useDriveSyncClients().filter((client) => client.rootId === root.id);
  const conflicts = useDriveConflicts(null);
  const open = flattenPages(conflicts.data, (page) => page.items).filter(
    (conflict) => conflict.rootId === root.id && conflict.resolvedAt === null,
  );
  const deviceIds = [...new Set(clients.map((client) => client.deviceId))];
  const computers = useStoreSelector((state) => computersIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  if (!root.synced) return null;
  return syncLineOf({
    rootBytes: root.bytes,
    clients,
    conflicts: { items: open, more: conflicts.hasNextPage },
    computers: new Map(computers.map((computer) => [computer.deviceId, computer])),
  });
}

function ComputerDot({
  dot,
  colours,
}: {
  readonly dot: SyncComputerDot;
  readonly colours: ToneColours;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={dot.label}
      className="flex-none flex-row items-center gap-1.5"
    >
      <DotStrip
        dots={[
          { key: dot.key, state: dot.state, colour: dot.tone === null ? null : colours[dot.tone] },
        ]}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {dot.name}
      </Text>
    </View>
  );
}

function useToneColours(): ToneColours {
  return {
    positive: useColour('positive'),
    info: useColour('info'),
    warning: useColour('warning'),
    critical: useColour('critical'),
  };
}

export function SyncStatusLine({ line }: { readonly line: SyncLine }): ReactNode {
  const colours = useToneColours();
  return (
    <View className="gap-2">
      <View accessible accessibilityLabel={line.sentence} className="flex-row items-center gap-2">
        <View aria-hidden className="shrink-0">
          <Arc
            value={line.ring}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            colour={RING_COLOUR[line.tone]}
          />
        </View>
        <Text
          variant="callout"
          tone={SENTENCE_TONE[line.tone]}
          numberOfLines={1}
          className="min-w-0 flex-1 tabular"
        >
          {line.sentence}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {line.computers.map((dot) => (
          <ComputerDot key={dot.key} dot={dot} colours={colours} />
        ))}
      </View>
    </View>
  );
}
