import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notifyFailure } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { saveAlbum, startAlbum } from './album-data';
import { useWhoSees } from '../sharing/album-who';
import { visibilityOf, type Visibility } from './model';
import { FieldGroup, SmartRuleEditor } from './rule-editor';
import { draftReady, withKind, type AlbumDraft } from './rule-draft';

export interface AlbumSheetRequest {
  readonly draft: AlbumDraft;
  readonly album: DriveAlbum | null;
  readonly itemIds: readonly string[];
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

function FixedWho({ who }: { readonly who: Visibility }): ReactNode {
  return (
    <View className="min-h-control-h flex-row items-center gap-1.5">
      <Icon name={who.icon} size={16} tone="variant" />
      <Text variant="callout">{who.label}</Text>
    </View>
  );
}

function AlbumWho({ album }: { readonly album: DriveAlbum }): ReactNode {
  return <FixedWho who={useWhoSees(album)} />;
}

function WhoSees({
  draft,
  album,
  onDraft,
}: {
  readonly draft: AlbumDraft;
  readonly album: DriveAlbum | null;
  readonly onDraft: (draft: AlbumDraft) => void;
}): ReactNode {
  return (
    <FieldGroup label="Who sees it">
      {album === null ? (
        <Segmented
          options={SCOPES}
          value={draft.scope}
          label="Who sees it"
          size="control"
          onChange={(scope) => {
            onDraft({ ...draft, scope });
          }}
        />
      ) : (
        <AlbumWho album={album} />
      )}
    </FieldGroup>
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
        <FieldGroup label="How it fills">
          <Segmented
            options={KINDS}
            value={draft.kind}
            label="How it fills"
            size="control"
            onChange={(kind) => {
              onDraft(withKind(draft, kind));
            }}
          />
        </FieldGroup>
      ) : null}
      {draft.kind === 'smart' ? <SmartRuleEditor draft={draft} onDraft={onDraft} /> : null}
      <WhoSees draft={draft} album={request.album} onDraft={onDraft} />
    </View>
  );
}

interface Opened {
  readonly request: AlbumSheetRequest;
  readonly draft: AlbumDraft;
}

export interface SavedAlbum {
  readonly id: string;
  readonly title: string;
}

type OnSaved = (album: SavedAlbum, created: boolean) => void;

function save(store: EntityStore, client: QueryClient, opened: Opened, onSaved: OnSaved): void {
  const { album, itemIds } = opened.request;
  const { draft } = opened;
  if (album !== null) {
    onSaved(album, false);
    saveAlbum(store, album, draft).catch(notifyFailure('The album was not saved'));
    return;
  }
  const started = startAlbum(store, client, draft, itemIds);
  onSaved(started, true);
  started.saved.catch(notifyFailure('The album was not made'));
}

function SheetFooter({
  opened,
  onClose,
  onSave,
}: {
  readonly opened: Opened;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <View className="flex-1 flex-row justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label={opened.request.album === null ? 'Create album' : 'Save'}
        onPress={onSave}
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
  const client = useQueryClient();
  const store = useEntityStore();
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
      detents={opened?.draft.kind === 'smart' ? ['full'] : ['half', 'full']}
      footer={
        opened === null ? null : (
          <SheetFooter
            opened={opened}
            onClose={onClose}
            onSave={() => {
              save(store, client, opened, onSaved);
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
