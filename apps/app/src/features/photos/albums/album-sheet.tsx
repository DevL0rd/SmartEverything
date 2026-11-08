import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { createAlbum, saveAlbum } from './album-data';
import { visibilityOf } from './model';
import { SmartRuleEditor } from './rule-editor';
import { draftReady, withKind, type AlbumDraft } from './rule-draft';

export interface AlbumSheetRequest {
  readonly draft: AlbumDraft;
  readonly album: DriveAlbum | null;
}

const KINDS: readonly SegmentedOption<DriveAlbum['kind']>[] = [
  { value: 'manual', label: 'I pick photos', icon: 'image' },
  { value: 'smart', label: 'It follows rules', icon: 'sparkles' },
];

const SCOPES: readonly SegmentedOption<DriveAlbum['scope']>[] = [
  { value: 'person', label: visibilityOf('person').label, icon: visibilityOf('person').icon },
  { value: 'home', label: visibilityOf('home').label, icon: visibilityOf('home').icon },
];

export function sheetTitle(request: AlbumSheetRequest, kind: DriveAlbum['kind']): string {
  if (request.album !== null) return kind === 'smart' ? 'Edit smart album' : 'Rename album';
  return kind === 'smart' ? 'New smart album' : 'New album';
}

function WhoSees({
  draft,
  fixed,
  onDraft,
}: {
  readonly draft: AlbumDraft;
  readonly fixed: boolean;
  readonly onDraft: (draft: AlbumDraft) => void;
}): ReactNode {
  const who = visibilityOf(draft.scope);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Who sees it
      </Text>
      {fixed ? (
        <View className="flex-row items-center gap-1.5">
          <Icon name={who.icon} size={16} tone="variant" />
          <Text variant="callout">{who.label}</Text>
        </View>
      ) : (
        <Segmented
          options={SCOPES}
          value={draft.scope}
          label="Who sees it"
          size="control"
          onChange={(scope) => {
            onDraft({ ...draft, scope });
          }}
        />
      )}
    </View>
  );
}

function SheetForm({
  request,
  draft,
  onDraft,
}: {
  readonly request: AlbumSheetRequest;
  readonly draft: AlbumDraft;
  readonly onDraft: (draft: AlbumDraft) => void;
}): ReactNode {
  return (
    <View className="gap-4 pb-2">
      <TextField
        label="Name"
        value={draft.title}
        focusOnMount={request.album === null}
        onChange={(title) => {
          onDraft({ ...draft, title });
        }}
      />
      {request.album === null ? (
        <Segmented
          options={KINDS}
          value={draft.kind}
          label="How it fills"
          size="control"
          onChange={(kind) => {
            onDraft(withKind(draft, kind));
          }}
        />
      ) : null}
      {draft.kind === 'smart' ? <SmartRuleEditor draft={draft} onDraft={onDraft} /> : null}
      <WhoSees draft={draft} fixed={request.album !== null} onDraft={onDraft} />
    </View>
  );
}

interface Opened {
  readonly request: AlbumSheetRequest;
  readonly draft: AlbumDraft;
}

type OnSaved = (album: DriveAlbum, created: boolean) => void;

function save(opened: Opened, mutation: MutationState, onSaved: OnSaved): void {
  const { album } = opened.request;
  const { draft } = opened;
  mutation.run(() => (album === null ? createAlbum(draft) : saveAlbum(album, draft)), {
    failure: album === null ? 'The album was not made' : 'The album was not saved',
    label: album === null ? 'photos.album_create' : 'photos.album_save',
    onDone: (saved) => {
      onSaved(saved, album === null);
    },
  });
}

function SheetFooter({
  opened,
  busy,
  onClose,
  onSave,
}: {
  readonly opened: Opened;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <View className="flex-row justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label={opened.request.album === null ? 'Create album' : 'Save'}
        onPress={onSave}
        loading={busy}
        disabled={!draftReady(opened.draft)}
      />
    </View>
  );
}

function openedOf(request: AlbumSheetRequest | null): Opened | null {
  return request === null ? null : { request, draft: request.draft };
}

export function AlbumSheet({
  request,
  onClose,
  onSaved,
}: {
  readonly request: AlbumSheetRequest | null;
  readonly onClose: () => void;
  readonly onSaved: OnSaved;
}): ReactNode {
  const [seen, setSeen] = useState(request);
  const [opened, setOpened] = useState(() => openedOf(request));
  const mutation = useMutationState();
  if (seen !== request) {
    setSeen(request);
    if (request !== null) setOpened(openedOf(request));
  }
  return (
    <Sheet
      open={request !== null}
      onClose={onClose}
      title={opened === null ? 'Album' : sheetTitle(opened.request, opened.draft.kind)}
      kind="inspector"
      detents={['full']}
      footer={
        opened === null ? null : (
          <SheetFooter
            opened={opened}
            busy={mutation.busy}
            onClose={onClose}
            onSave={() => {
              save(opened, mutation, onSaved);
            }}
          />
        )
      }
    >
      {opened === null ? null : (
        <SheetForm
          request={opened.request}
          draft={opened.draft}
          onDraft={(draft) => {
            setOpened({ request: opened.request, draft });
          }}
        />
      )}
    </Sheet>
  );
}
