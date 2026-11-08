import type {
  PlannerAttachment,
  PlannerAttachmentKind,
  PlannerItemRow,
} from '@smarteverything/domain';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { pickFiles } from '../../../platform/pick-files';
import { useDevices, useRows } from '../../../store/selectors';
import { attachFiles, clearUploads, useUploads, type Upload } from '../../assistant/data/uploads';
import {
  AttachmentChips,
  DEFAULT_FACE,
  DEVICE_FACES,
  FACE_LABEL,
  attachmentKeyOf,
  deviceGroupsOf,
  namedGroupsOf,
  pendingOf,
  uploadStateOf,
  useAttachmentNames,
  withoutAttachment,
  type AttachmentNames,
  type DeviceFaceChoice,
  type Pending,
  type PickEntry,
  type PickGroups,
  type Picked,
} from './attachment-chips';
import { subjectOf } from './completion-rule-row';
import type { ItemChanges } from './repeat-scope-bar';

const KIND_OPTIONS: readonly SegmentedOption<PlannerAttachmentKind>[] = [
  { value: 'device', label: 'Device' },
  { value: 'scene', label: 'Scene' },
  { value: 'automation', label: 'Automation' },
  { value: 'file', label: 'File' },
  { value: 'link', label: 'Link' },
];

const FACE_OPTIONS: readonly SegmentedOption<DeviceFaceChoice>[] = DEVICE_FACES.map((face) => ({
  value: face,
  label: FACE_LABEL[face],
}));

const SEARCH_HINT: Readonly<Record<'device' | 'scene' | 'automation', string>> = {
  device: 'Search devices',
  scene: 'Search scenes',
  automation: 'Search automations',
};

function EntryRows({
  groups,
  chosen,
  onChoose,
}: {
  readonly groups: PickGroups;
  readonly chosen: string | null;
  readonly onChoose: (id: string) => void;
}): ReactNode {
  const rows = (entries: readonly PickEntry[]): ReactNode =>
    entries.map((entry) => (
      <ListRow
        key={entry.id}
        wrapTitle
        title={entry.title}
        {...(entry.subtitle === null ? {} : { subtitle: entry.subtitle })}
        icon={entry.icon}
        iconTone={entry.id === chosen ? 'primary' : 'variant'}
        selected={entry.id === chosen}
        role="checkbox"
        checked={entry.id === chosen}
        trailing={entry.id === chosen ? <Icon name="check" size={20} tone="primary" /> : null}
        onPress={() => {
          onChoose(entry.id);
        }}
      />
    ));
  if (groups.suggested.length === 0 && groups.rest.length === 0) {
    return (
      <Text variant="footnote" tone="variant" className="px-4">
        Nothing to attach here.
      </Text>
    );
  }
  return (
    <>
      {groups.suggested.length === 0 ? null : (
        <List title="Suggested">{rows(groups.suggested)}</List>
      )}
      {groups.rest.length === 0 ? null : <List>{rows(groups.rest)}</List>}
    </>
  );
}

function FilePane({
  uploads,
  draftKey,
}: {
  readonly uploads: readonly Upload[];
  readonly draftKey: string;
}): ReactNode {
  const choose = (): void => {
    pickFiles('files').then(
      (files) => {
        attachFiles(files, draftKey);
      },
      (error: unknown) => {
        notify({ message: 'Couldn’t open the picker', error, tone: 'critical' });
      },
    );
  };
  return (
    <View className="gap-3">
      <View className="self-start">
        <Button label="Choose a file" icon="fileText" variant="tonal" onPress={choose} />
      </View>
      {uploads.length === 0 ? null : (
        <List>
          {uploads.map((upload) => (
            <ListRow
              key={upload.key}
              wrapTitle
              title={upload.name}
              icon="paperclip"
              value={uploadStateOf(upload)}
            />
          ))}
        </List>
      )}
    </View>
  );
}

interface PaneProps {
  readonly picked: Picked;
  readonly onPick: (change: Partial<Picked>) => void;
}

function LinkPane({ picked, onPick }: PaneProps): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Link"
        kind="url"
        value={picked.url}
        placeholder="https://"
        onChange={(url) => {
          onPick({ url });
        }}
      />
      <TextField
        label="Name"
        value={picked.title}
        placeholder="Podcast queue"
        helper="Optional"
        onChange={(title) => {
          onPick({ title });
        }}
      />
    </View>
  );
}

interface ChoicePaneProps extends PaneProps {
  readonly groups: PickGroups;
  readonly search: string;
  readonly onSearch: (text: string) => void;
}

function ChoicePane({ picked, onPick, groups, search, onSearch }: ChoicePaneProps): ReactNode {
  const hint = picked.kind === 'scene' || picked.kind === 'automation' ? picked.kind : 'device';
  return (
    <View className="gap-3">
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder={SEARCH_HINT[hint]}
        variant="field"
      />
      <EntryRows
        groups={groups}
        chosen={picked.chosen}
        onChoose={(chosen) => {
          onPick({ chosen });
        }}
      />
      {picked.kind === 'device' && picked.chosen !== null ? (
        <View className="gap-2">
          <Text variant="label" tone="variant">
            Show it as
          </Text>
          <Segmented
            options={FACE_OPTIONS}
            value={picked.face}
            onChange={(face) => {
              onPick({ face });
            }}
            label="Widget face"
            fill
          />
        </View>
      ) : null}
    </View>
  );
}

export interface AttachmentPickerProps {
  readonly opener: RefObject<View | null>;
  readonly item: PlannerItemRow;
  readonly names: AttachmentNames;
  readonly disabled: boolean;
  readonly onAttach: (attachments: readonly PlannerAttachment[]) => void;
  readonly onClose: () => void;
}

const START: Picked = { kind: 'device', chosen: null, face: DEFAULT_FACE, url: '', title: '' };

function usePickGroups(
  item: PlannerItemRow,
  names: AttachmentNames,
  picked: Picked,
  search: string,
): PickGroups {
  const devices = useDevices();
  const scenes = useRows('scenes');
  const automations = useRows('automations');
  const filter = { taken: new Set(item.attachments.map(attachmentKeyOf)), text: search };
  if (picked.kind === 'scene') return namedGroupsOf(scenes, 'scene', filter);
  if (picked.kind === 'automation') return namedGroupsOf(automations, 'automation', filter);
  return deviceGroupsOf(devices, names, filter, subjectOf(item.completion));
}

interface PickerState {
  readonly draftKey: string;
  readonly picked: Picked;
  readonly search: string;
  readonly uploads: readonly Upload[];
  readonly groups: PickGroups;
  readonly pending: Pending | null;
  readonly pick: (change: Partial<Picked>) => void;
  readonly pickKind: (kind: PlannerAttachmentKind) => void;
  readonly setSearch: (text: string) => void;
  readonly close: () => void;
  readonly attach: () => void;
}

function usePickerState(props: AttachmentPickerProps): PickerState {
  const draftKey = `planner:${props.item.id}`;
  const [picked, setPicked] = useState<Picked>(START);
  const [search, setSearch] = useState('');
  const uploads = useUploads(draftKey);
  const pending = pendingOf(picked, props.names, uploads);
  const close = (): void => {
    clearUploads(draftKey);
    props.onClose();
  };
  return {
    draftKey,
    picked,
    search,
    uploads,
    groups: usePickGroups(props.item, props.names, picked, search),
    pending,
    pick: (change): void => {
      setPicked((current) => ({ ...current, ...change }));
    },
    pickKind: (kind): void => {
      setSearch('');
      setPicked({ ...START, kind });
    },
    setSearch,
    close,
    attach: (): void => {
      if (pending === null) return;
      props.onAttach(pending.attachments);
      close();
    },
  };
}

export function AttachmentPicker(props: AttachmentPickerProps): ReactNode {
  const state = usePickerState(props);
  const { draftKey, picked, search, uploads, groups, pending, pick, pickKind } = state;
  return (
    <Sheet
      subpage={{ opener: props.opener }}
      open
      onClose={state.close}
      title="Attach"
      detents={['half', 'full']}
      footer={
        <Button
          label={pending?.label ?? 'Attach'}
          icon="paperclip"
          variant="filled"
          grow
          disabled={pending === null || props.disabled}
          onPress={state.attach}
        />
      }
    >
      <View className="gap-4">
        <Segmented
          options={KIND_OPTIONS}
          value={picked.kind}
          onChange={pickKind}
          label="Attachment kind"
          fill
        />
        {picked.kind === 'file' ? <FilePane uploads={uploads} draftKey={draftKey} /> : null}
        {picked.kind === 'link' ? <LinkPane picked={picked} onPick={pick} /> : null}
        {picked.kind === 'file' || picked.kind === 'link' ? null : (
          <ChoicePane
            picked={picked}
            onPick={pick}
            groups={groups}
            search={search}
            onSearch={state.setSearch}
          />
        )}
      </View>
    </Sheet>
  );
}

export interface ItemAttachmentsProps {
  readonly item: PlannerItemRow;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}

export function ItemAttachments({ item, disabled, onChange }: ItemAttachmentsProps): ReactNode {
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const names = useAttachmentNames();
  return (
    <>
      <AttachmentChips
        attachments={item.attachments}
        names={names}
        disabled={disabled}
        addRef={opener}
        onAdd={() => {
          setOpen(true);
        }}
        onRemove={(key) => {
          onChange({ attachments: withoutAttachment(item.attachments, key) });
        }}
      />
      {open ? (
        <AttachmentPicker
          opener={opener}
          item={item}
          names={names}
          disabled={disabled}
          onAttach={(added) => {
            onChange({ attachments: [...item.attachments, ...added] });
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
