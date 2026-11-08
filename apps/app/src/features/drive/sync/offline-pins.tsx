import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';

export const PINS_TITLE = 'Kept offline';

export const PINS_PLACE = 'in the mount cache';

export const PINS_NOTE = 'Only for folders this computer does not sync. They open without the hub.';

export const NO_PINS =
  'Nothing is kept offline. Folders you keep offline on the mounted drive show here.';

export interface OfflinePin {
  readonly rootId: string;
  readonly rootLabel: string;
  readonly path: string;
  readonly bytes: number;
}

export function pinKeyOf(pin: OfflinePin): string {
  return `${pin.rootId}/${pin.path}`;
}

export function pinTrailOf(path: string): string {
  return path
    .split('/')
    .filter((part) => part !== '')
    .join(' › ');
}

export function pinsSummaryOf(pins: readonly OfflinePin[]): string {
  if (pins.length === 0) return 'Nothing kept offline';
  return joinParts([
    plural(pins.length, 'folder'),
    bytes(pins.reduce((sum, pin) => sum + pin.bytes, 0)),
  ]);
}

export function pinsShownFor(
  placements: readonly DrivePlacement[],
  deviceId: string,
  rootId: string,
): boolean {
  const here = placements.filter(
    (placement) => placement.deviceId === deviceId && placement.rootId === rootId,
  );
  return (
    here.some((placement) => placement.mode === 'mounted') &&
    !here.some((placement) => placement.mode === 'synced')
  );
}

export interface OfflinePinsProps {
  readonly pins: readonly OfflinePin[];
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onRemove: (pin: OfflinePin) => void;
}

function PinRow({
  pin,
  busy,
  onRemove,
}: {
  readonly pin: OfflinePin;
  readonly busy: boolean;
  readonly onRemove: (pin: OfflinePin) => void;
}): ReactNode {
  const trail = pinTrailOf(pin.path);
  return (
    <ListRow
      title={trail}
      subtitle={pin.rootLabel}
      icon="folder"
      value={bytes(pin.bytes)}
      label={`${trail} in ${pin.rootLabel}, ${bytes(pin.bytes)} kept offline`}
      trailing={
        <Button
          label="Remove"
          spoken={`Stop keeping ${trail} offline`}
          variant="text"
          disabled={busy}
          onPress={() => {
            onRemove(pin);
          }}
        />
      }
    />
  );
}

export function OfflinePins({ pins, busy, problem, onRemove }: OfflinePinsProps): ReactNode {
  return (
    <Card
      title={PINS_TITLE}
      icon="pin"
      metadata={
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink">
          {pins.length === 0 ? PINS_PLACE : joinParts([pinsSummaryOf(pins), PINS_PLACE])}
        </Text>
      }
    >
      <Text variant="footnote" tone="variant">
        {PINS_NOTE}
      </Text>
      {pins.length === 0 ? (
        <Text variant="footnote" tone="variant">
          {NO_PINS}
        </Text>
      ) : (
        <View>
          {pins.map((pin) => (
            <PinRow key={pinKeyOf(pin)} pin={pin} busy={busy} onRemove={onRemove} />
          ))}
        </View>
      )}
      {problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {problem}
        </Text>
      )}
    </Card>
  );
}
