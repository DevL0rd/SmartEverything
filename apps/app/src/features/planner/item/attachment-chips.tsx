import {
  PLANNER_ATTACHMENT,
  deviceFamily,
  type DeviceFamily,
  type ModelCatalog,
  type ModelOverrideIndex,
  type PlannerAttachment,
  type PlannerAttachmentKind,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useMemo, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import type { IconName } from '../../../components/icon';
import { Section } from '../../../components/section';
import { compareText, hostOf } from '../../../format/text';
import { useDevices, useRooms, useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { readyAttachments, type Upload } from '../../assistant/data/uploads';
import { familyIcon } from '../../device-visuals';
import { DeviceFace } from '../../devices';
import { modelSubjectOf, resolvedModelOf, useModelCatalog, useModelOverrides } from '../../models';

const log = new Logger('app.planner');

export const DEVICE_FACES = ['row', 'card', 'panel'] as const;

export type DeviceFaceChoice = (typeof DEVICE_FACES)[number];

const DEVICE_FACE = z.enum(DEVICE_FACES);

export const FACE_LABEL: Readonly<Record<DeviceFaceChoice, string>> = {
  row: 'Status line',
  card: 'Card',
  panel: 'Controls',
};

export const DEFAULT_FACE: DeviceFaceChoice = 'card';

const SPECIFIC_MODELS: ReadonlySet<string> = new Set([
  'device-override',
  'identity-override',
  'plugin-identity',
]);

export interface DeviceLine {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string | null;
  readonly icon: IconName;
  readonly family: DeviceFamily;
}

export interface AttachmentNames {
  readonly devices: ReadonlyMap<string, DeviceLine>;
  readonly scenes: ReadonlyMap<string, string>;
  readonly automations: ReadonlyMap<string, string>;
}

export interface AttachmentView {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
}

export function faceOf(face: string | null): DeviceFaceChoice {
  if (face === null) return DEFAULT_FACE;
  const parsed = DEVICE_FACE.safeParse(face);
  if (parsed.success) return parsed.data;
  log.warn('attachment.face_unknown', { face });
  return DEFAULT_FACE;
}

export function modelTitleOf(
  device: Device,
  catalog: ModelCatalog,
  overrides: ModelOverrideIndex,
): string | null {
  const { resolution } = resolvedModelOf(modelSubjectOf(device), catalog, overrides);
  const main = resolution.main;
  if (main?.kind !== 'catalogue' || !SPECIFIC_MODELS.has(resolution.source)) return null;
  return catalog.find(main.modelId)?.title ?? null;
}

function placeOf(label: string, family: DeviceFamily, roomName: string | null): string | null {
  const noun = family === 'generic' ? null : family.replaceAll('_', ' ');
  const named = noun === null || label.toLocaleLowerCase().includes(noun);
  const parts = [roomName, named ? null : noun].flatMap((part) => (part === null ? [] : [part]));
  return parts.length === 0 ? null : parts.join(' · ');
}

export function deviceLineOf(
  device: Device,
  roomName: string | null,
  modelTitle: string | null,
): DeviceLine {
  const family = deviceFamily(device);
  const model = modelTitle === device.label ? null : modelTitle;
  return {
    id: device.id,
    label: device.label,
    subtitle: model ?? placeOf(device.label, family, roomName),
    icon: familyIcon(family),
    family,
  };
}

export function attachmentKeyOf(attachment: PlannerAttachment): string {
  switch (attachment.kind) {
    case 'device':
      return `device:${attachment.deviceId}`;
    case 'scene':
      return `scene:${attachment.sceneId}`;
    case 'automation':
      return `automation:${attachment.automationId}`;
    case 'file':
      return `file:${attachment.fileId}`;
    case 'link':
      return `link:${attachment.url}`;
  }
}

function deviceView(
  attachment: Extract<PlannerAttachment, { readonly kind: 'device' }>,
  names: AttachmentNames,
): AttachmentView {
  const line = names.devices.get(attachment.deviceId);
  const face = FACE_LABEL[faceOf(attachment.face)].toLocaleLowerCase();
  return {
    key: attachmentKeyOf(attachment),
    label: `${line?.label ?? 'Removed device'} · ${face}`,
    icon: line?.icon ?? 'cpu',
  };
}

export function attachmentViewOf(
  attachment: PlannerAttachment,
  names: AttachmentNames,
): AttachmentView {
  const key = attachmentKeyOf(attachment);
  switch (attachment.kind) {
    case 'device':
      return deviceView(attachment, names);
    case 'scene':
      return {
        key,
        label: `Scene · ${names.scenes.get(attachment.sceneId) ?? 'removed'}`,
        icon: 'sparkles',
      };
    case 'automation':
      return {
        key,
        label: `Automation · ${names.automations.get(attachment.automationId) ?? 'removed'}`,
        icon: 'automations',
      };
    case 'file':
      return { key, label: 'File', icon: 'paperclip' };
    case 'link':
      return {
        key,
        label: `Link · ${attachment.title ?? hostOf(attachment.url) ?? attachment.url}`,
        icon: 'link',
      };
  }
}

export function withoutAttachment(
  attachments: readonly PlannerAttachment[],
  key: string,
): PlannerAttachment[] {
  return attachments.filter((attachment) => attachmentKeyOf(attachment) !== key);
}

export interface PickEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: IconName;
}

export interface PickGroups {
  readonly suggested: readonly PickEntry[];
  readonly rest: readonly PickEntry[];
}

function matches(entry: PickEntry, needle: string): boolean {
  if (needle === '') return true;
  return [entry.title, entry.subtitle ?? ''].some((text) =>
    text.toLocaleLowerCase().includes(needle),
  );
}

function byTitle(left: PickEntry, right: PickEntry): number {
  return compareText(left.title, right.title);
}

export interface PickFilter {
  readonly taken: ReadonlySet<string>;
  readonly text: string;
}

export function deviceGroupsOf(
  devices: readonly Device[],
  names: AttachmentNames,
  { taken, text }: PickFilter,
  suggestedId: string | null,
): PickGroups {
  const needle = text.trim().toLocaleLowerCase();
  const entries = devices.flatMap((device): PickEntry[] => {
    const line = names.devices.get(device.id);
    if (device.parent_id !== null || line === undefined || taken.has(`device:${device.id}`)) {
      return [];
    }
    return [{ id: line.id, title: line.label, subtitle: line.subtitle, icon: line.icon }];
  });
  const shown = entries.filter((entry) => matches(entry, needle)).sort(byTitle);
  return {
    suggested: shown.filter((entry) => entry.id === suggestedId),
    rest: shown.filter((entry) => entry.id !== suggestedId),
  };
}

const NAMED_ICONS: Readonly<Record<'scene' | 'automation', IconName>> = {
  scene: 'sparkles',
  automation: 'automations',
};

export function namedGroupsOf(
  rows: readonly { readonly id: string; readonly name: string }[],
  kind: 'scene' | 'automation',
  { taken, text }: PickFilter,
): PickGroups {
  const needle = text.trim().toLocaleLowerCase();
  const rest = rows
    .filter((row) => !taken.has(`${kind}:${row.id}`))
    .map((row) => ({ id: row.id, title: row.name, subtitle: null, icon: NAMED_ICONS[kind] }))
    .filter((entry) => matches(entry, needle))
    .sort(byTitle);
  return { suggested: [], rest };
}

export function linkAttachmentOf(url: string, title: string): PlannerAttachment | null {
  const named = title.trim();
  const parsed = PLANNER_ATTACHMENT.safeParse({
    kind: 'link',
    url: url.trim(),
    title: named === '' ? null : named,
  });
  return parsed.success ? parsed.data : null;
}

export interface Picked {
  readonly kind: PlannerAttachmentKind;
  readonly chosen: string | null;
  readonly face: DeviceFaceChoice;
  readonly url: string;
  readonly title: string;
}

export interface Pending {
  readonly attachments: readonly PlannerAttachment[];
  readonly label: string;
}

function chosenPending(picked: Picked, names: AttachmentNames): Pending | null {
  const id = picked.chosen;
  if (id === null) return null;
  if (picked.kind === 'device') {
    const name = names.devices.get(id)?.label ?? 'device';
    return {
      attachments: [{ kind: 'device', deviceId: id, face: picked.face }],
      label: `Attach ${name}`,
    };
  }
  if (picked.kind === 'scene') {
    return {
      attachments: [{ kind: 'scene', sceneId: id }],
      label: `Attach ${names.scenes.get(id) ?? 'scene'}`,
    };
  }
  const name = names.automations.get(id) ?? 'automation';
  return { attachments: [{ kind: 'automation', automationId: id }], label: `Attach ${name}` };
}

export function pendingOf(
  picked: Picked,
  names: AttachmentNames,
  uploads: readonly Upload[],
): Pending | null {
  if (picked.kind === 'link') {
    const link = linkAttachmentOf(picked.url, picked.title);
    return link === null ? null : { attachments: [link], label: 'Attach link' };
  }
  if (picked.kind === 'file') {
    const ids = readyAttachments(uploads);
    if (ids === null || ids.length === 0) return null;
    return {
      attachments: ids.map((fileId): PlannerAttachment => ({ kind: 'file', fileId })),
      label: ids.length === 1 ? 'Attach file' : `Attach ${String(ids.length)} files`,
    };
  }
  return chosenPending(picked, names);
}

export function uploadStateOf(upload: Upload): string {
  if (upload.state === 'failed') return upload.failure?.text ?? 'Failed';
  if (upload.state === 'done') return 'Ready';
  return `${String(Math.round(upload.progress * 100))} %`;
}

export function useDeviceLines(): ReadonlyMap<string, DeviceLine> {
  const devices = useDevices({ includeHidden: true });
  const rooms = useRooms();
  const catalog = useModelCatalog();
  const overrides = useModelOverrides();
  return useMemo(() => {
    const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
    return new Map(
      devices.map((device) => [
        device.id,
        deviceLineOf(
          device,
          device.room_id === null ? null : (roomNames.get(device.room_id) ?? null),
          modelTitleOf(device, catalog, overrides),
        ),
      ]),
    );
  }, [devices, rooms, catalog, overrides]);
}

export function useAttachmentNames(): AttachmentNames {
  const devices = useDeviceLines();
  const scenes = useRows('scenes');
  const automations = useRows('automations');
  return useMemo(
    () => ({
      devices,
      scenes: new Map(scenes.map((scene) => [scene.id, scene.name])),
      automations: new Map(automations.map((automation) => [automation.id, automation.name])),
    }),
    [devices, scenes, automations],
  );
}

export function AttachedWidgets({
  attachments,
}: {
  readonly attachments: readonly PlannerAttachment[];
}): ReactNode {
  const devices = attachments.flatMap((attachment) =>
    attachment.kind === 'device' ? [attachment] : [],
  );
  if (devices.length === 0) return null;
  return (
    <View className="gap-2">
      {devices.map((attachment) => (
        <DeviceFace
          key={attachment.deviceId}
          deviceId={attachment.deviceId}
          face={faceOf(attachment.face)}
          context="standalone"
        />
      ))}
    </View>
  );
}

export interface AttachmentChipsProps {
  readonly attachments: readonly PlannerAttachment[];
  readonly names: AttachmentNames;
  readonly disabled: boolean;
  readonly onRemove: (key: string) => void;
  readonly onAdd: () => void;
  readonly addRef?: Ref<View>;
}

function AddButton({ disabled, onAdd, addRef }: AttachmentChipsProps): ReactNode {
  return (
    <Button
      label="Attach"
      icon="paperclip"
      variant="text"
      disabled={disabled}
      onPress={onAdd}
      {...(addRef === undefined ? {} : { ref: addRef })}
    />
  );
}

export function AttachmentChips(props: AttachmentChipsProps): ReactNode {
  const { attachments, names, disabled, onRemove } = props;
  if (attachments.length === 0) {
    return (
      <View className="self-start">
        <AddButton {...props} />
      </View>
    );
  }
  return (
    <Section title="Attached" action={<AddButton {...props} />}>
      <View className="gap-3">
        <AttachedWidgets attachments={attachments} />
        <View className="flex-row flex-wrap gap-2 px-4">
          {attachments.map((attachment) => {
            const view = attachmentViewOf(attachment, names);
            return (
              <FilterChip
                key={view.key}
                label="Remove attachment"
                value={view.label}
                icon={view.icon}
                active
                affordance={disabled ? undefined : 'remove'}
                onPress={() => {
                  if (!disabled) onRemove(view.key);
                }}
              />
            );
          })}
        </View>
      </View>
    </Section>
  );
}
