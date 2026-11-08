import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { SearchField } from '../../../../components/search-field';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { DeviceThumb } from '../list-editor/device-item';
import { NOT_ON_MAP_TEXT } from '../list-editor/objects-devices-model';
import { DeviceInspector } from './device-inspector';
import {
  pickerSections,
  placeableIds,
  waitingCount,
  type PickerDevice,
  type PickerSection,
} from './device-picker-model';
import type { RoomFlowRow } from './device-room-flow';
import type { DevicesTool } from './devices';
import { ARMED_TAGS, chosenHomeRoom, type ArmedDevice, type RoomMove } from './devices-model';

export const TRAY_TITLE = 'Devices by room';
export const TRAY_EMPTY_TEXT = 'Every device is on the map';
export const TRAY_SEARCH_TEXT = 'Search devices or rooms';
export const TRAY_NO_MATCH_TEXT = 'No devices match.';
export const CURRENT_ROOM_LABEL = 'This room';
export const PLACED_TEXT = 'On the map. Tap to move it.';
export const PLACE_ALL_LABEL = 'Place all automatically';
export const ROW_HINT = 'Tap, then tap the map where it goes.';

export function moveTitle(move: Pick<RoomMove, 'name' | 'toName'>): string {
  return `Move ${move.name} to ${move.toName}`;
}

export function keepLabel(move: Pick<RoomMove, 'fromName' | 'from'>): string {
  if (move.from === null) return 'Keep without a room';
  return `Keep in ${move.fromName ?? 'its room'}`;
}

export function movedTitle(move: Pick<RoomMove, 'name' | 'toName'>): string {
  return `${move.name} is in ${move.toName} now`;
}

export function trayCaption(entry: PickerDevice): string {
  if (entry.placed) return PLACED_TEXT;
  return entry.onMap ? 'Not on the map yet' : NOT_ON_MAP_TEXT;
}

export function armedTag(armed: ArmedDevice | null, deviceId: string): string | null {
  return armed?.deviceId === deviceId ? ARMED_TAGS[armed.mount] : null;
}

function RoomChangeRow({
  tool,
  move,
}: {
  readonly tool: RoomFlowRow;
  readonly move: RoomMove;
}): ReactNode {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-2 rounded-md border-hairline border-primary bg-surface-2 p-3"
    >
      <Text variant="body-strong">{moveTitle(move)}</Text>
      <Text variant="footnote" tone="variant">
        Its room decides which room lights, automations and the assistant include it.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Move" icon="move" grow disabled={tool.readOnly} onPress={tool.confirmMove} />
        <Button
          label={keepLabel(move)}
          variant="outlined"
          grow
          disabled={tool.readOnly}
          onPress={tool.keep}
        />
      </View>
    </View>
  );
}

function MovedRow({
  tool,
  move,
}: {
  readonly tool: RoomFlowRow;
  readonly move: RoomMove;
}): ReactNode {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="min-h-touch-min flex-row items-center gap-2 rounded-md bg-surface-2 p-2 pl-3"
    >
      <Text variant="body" className="min-w-0 flex-1" numberOfLines={2}>
        {movedTitle(move)}
      </Text>
      <Button
        label="Undo"
        icon="undo"
        variant="tonal"
        disabled={tool.readOnly}
        onPress={tool.undoMove}
      />
      <IconButton icon="close" label="Close" onPress={tool.dismiss} />
    </View>
  );
}

export function FlowRow({ tool }: { readonly tool: RoomFlowRow }): ReactNode {
  if (tool.pending !== null) return <RoomChangeRow tool={tool} move={tool.pending} />;
  if (tool.moved !== null) return <MovedRow tool={tool} move={tool.moved} />;
  if (tool.note === null) return null;
  return <Banner tone="warning" title={tool.note} onDismiss={tool.dismiss} />;
}

function TrayRow({
  tool,
  entry,
}: {
  readonly tool: DevicesTool;
  readonly entry: PickerDevice;
}): ReactNode {
  const { device } = entry;
  const tag = armedTag(tool.armed, device.id);
  return (
    <Interactive
      role="button"
      label={device.label}
      hint={ROW_HINT}
      selected={tag !== null}
      disabled={tool.readOnly}
      onPress={(): void => {
        tool.arm(tag === null ? device : null);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-md p-2',
        tag === null ? 'bg-surface-1' : 'bg-primary-container',
      )}
    >
      <DeviceThumb device={device} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {trayCaption(entry)}
        </Text>
      </View>
      {tag === null ? null : <Badge label={tag} tone="primary" />}
    </Interactive>
  );
}

function TraySection({
  tool,
  section,
}: {
  readonly tool: DevicesTool;
  readonly section: PickerSection;
}): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2 pt-1">
        <Text variant="footnote" tone="variant" accessibilityRole="header" className="flex-1">
          {`${section.title} · ${String(section.devices.length)}`}
        </Text>
        {section.current ? <Badge label={CURRENT_ROOM_LABEL} tone="primary" /> : null}
      </View>
      {section.devices.map((entry) => (
        <TrayRow key={entry.device.id} tool={tool} entry={entry} />
      ))}
    </View>
  );
}

export function DeviceTray({ tool }: { readonly tool: DevicesTool }): ReactNode {
  const [text, setText] = useState('');
  const waiting = waitingCount(tool.map, tool.devices);
  const sections = pickerSections({
    map: tool.map,
    devices: tool.devices,
    rooms: tool.rooms,
    currentRoomId: chosenHomeRoom(tool.floor, tool.devices, tool.selected),
    text,
  });
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="body-strong" accessibilityRole="header" className="flex-1">
          {TRAY_TITLE}
        </Text>
        <Badge label={String(waiting)} tone={waiting > 0 ? 'primary' : 'neutral'} />
      </View>
      {waiting === 0 ? (
        <Text variant="footnote" tone="variant">
          {TRAY_EMPTY_TEXT}
        </Text>
      ) : null}
      <SearchField value={text} onChange={setText} placeholder={TRAY_SEARCH_TEXT} variant="field" />
      {sections.map((section) => (
        <TraySection key={section.key} tool={tool} section={section} />
      ))}
      {sections.length === 0 ? (
        <Text variant="callout" tone="variant">
          {TRAY_NO_MATCH_TEXT}
        </Text>
      ) : null}
    </View>
  );
}

function PlaceAll({ tool }: { readonly tool: DevicesTool }): ReactNode {
  if (placeableIds(tool.map, tool.devices).length === 0) return null;
  return (
    <Button
      label={PLACE_ALL_LABEL}
      icon="sparkles"
      variant="tonal"
      disabled={tool.readOnly}
      onPress={tool.placeAll}
    />
  );
}

export function DevicesPanel({ tool }: { readonly tool: DevicesTool }): ReactNode {
  const device = tool.devices.find((each) => each.id === tool.selected);
  const placement = tool.floor?.placements.find((each) => each.deviceId === tool.selected);
  return (
    <>
      <FlowRow tool={tool} />
      {device === undefined || placement === undefined ? null : (
        <DeviceInspector tool={tool} device={device} placement={placement} />
      )}
      <PlaceAll tool={tool} />
      <DeviceTray tool={tool} />
    </>
  );
}
