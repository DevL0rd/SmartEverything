import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, Share, View } from 'react-native';
import type { DriveFileRequest, DriveFileRequestCreated, DriveItem } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import { CopyField } from '../../../components/copy-field';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useIdiom } from '../../../design/platform';
import { createDriveFileRequest, updateDriveFileRequest } from '../../../api/drive';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useSyncStatus } from '../../../store/selectors';
import { reachOf } from '../share/share-model';
import {
  LINK_SHOWN_ONCE_LINE,
  REQUEST_HOW_LINE,
  changeBodyOf,
  createBodyOf,
  draftReadyOf,
  editDraftOf,
  newDraftOf,
  requestEndOptionsOf,
  sheetTitleOf,
  type FileRequestDraft,
} from './file-request-model';

const log = new Logger('app.drive');

type Folder = Pick<DriveItem, 'id' | 'name'>;

interface Opened {
  readonly folder: Folder;
  readonly editing: DriveFileRequest | null;
  readonly anchorRef: RefObject<View | null> | null;
  readonly draft: FileRequestDraft;
  readonly created: DriveFileRequestCreated | null;
}

function EndChoice({
  opened,
  onDraft,
}: {
  readonly opened: Opened;
  readonly onDraft: (draft: FileRequestDraft) => void;
}): ReactNode {
  const now = useMinute();
  const { draft } = opened;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="callout">Stops taking files</Text>
      <ChoiceChip
        label="Stops taking files"
        icon="clock"
        options={requestEndOptionsOf(opened.editing, now)}
        value={draft.end}
        all={opened.editing === null ? 'never' : 'keep'}
        onChange={(end) => {
          onDraft({ ...draft, end });
        }}
      />
    </View>
  );
}

function Form({
  opened,
  disabled,
  onDraft,
}: {
  readonly opened: Opened;
  readonly disabled: boolean;
  readonly onDraft: (draft: FileRequestDraft) => void;
}): ReactNode {
  const { draft } = opened;
  return (
    <View className="gap-3">
      <Text variant="footnote" tone="variant">
        {REQUEST_HOW_LINE}
      </Text>
      <TextField
        label="Title"
        value={draft.title}
        disabled={disabled}
        error={draftReadyOf(draft) ? null : 'Give the request a title'}
        onChange={(title) => {
          onDraft({ ...draft, title });
        }}
      />
      <TextField
        label="Message"
        value={draft.message}
        multiline
        disabled={disabled}
        helper="Optional. Shown on the upload page."
        onChange={(message) => {
          onDraft({ ...draft, message });
        }}
      />
      <EndChoice opened={opened} onDraft={onDraft} />
    </View>
  );
}

function Made({
  created,
  folder,
}: {
  readonly created: DriveFileRequestCreated;
  readonly folder: Folder;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <View className="gap-3">
      <CopyField label="Upload link" value={created.url} />
      <Text variant="footnote" tone="warning">
        {LINK_SHOWN_ONCE_LINE}
      </Text>
      <Text variant="footnote" tone="variant">
        {reachOf(created.public)}
      </Text>
      <Text variant="footnote" tone="variant">
        {`Files sent with it land in ${folder.name}. You get a notification for each upload.`}
      </Text>
      {touch ? (
        <View className="flex-row">
          <Button
            label="Send with another app"
            icon="share"
            variant="tonal"
            grow
            onPress={() => {
              background(
                Share.share({ message: created.url, title: created.request.title }),
                'drive.file_request.send_failed',
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

interface Save {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly save: (opened: Opened) => void;
}

type Mutation = ReturnType<typeof useMutationState>;

function runChange(
  mutation: Mutation,
  opened: Opened & { readonly editing: DriveFileRequest },
  onSaved: () => void,
): void {
  const body = changeBodyOf(opened.editing, opened.draft, Date.now());
  if (body === null) {
    onSaved();
    return;
  }
  const fileRequestId = opened.editing.id;
  mutation.run(
    async () => {
      await updateDriveFileRequest(fileRequestId, body);
      log.info('file_request.changed', { fileRequestId, fields: Object.keys(body) });
    },
    {
      failure: 'The file request was not changed',
      label: 'drive.file_request.update',
      inline: true,
      onDone: onSaved,
    },
  );
}

function runCreate(
  mutation: Mutation,
  opened: Opened,
  onCreated: (created: DriveFileRequestCreated) => void,
): void {
  const body = createBodyOf(opened.folder.id, opened.draft, Date.now());
  if (body === null) return;
  mutation.run(
    async () => {
      const created = await createDriveFileRequest(body);
      log.info('file_request.created', {
        fileRequestId: created.request.id,
        folderItemId: body.folderItemId,
        ends: body.expiresAt !== null,
        public: created.public,
      });
      return created;
    },
    {
      failure: 'The upload link was not made',
      label: 'drive.file_request.create',
      inline: true,
      onDone: onCreated,
    },
  );
}

function useSave(onCreated: (created: DriveFileRequestCreated) => void, onSaved: () => void): Save {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    save: (opened): void => {
      const { editing } = opened;
      if (editing === null) runCreate(mutation, opened, onCreated);
      else runChange(mutation, { ...opened, editing }, onSaved);
    },
  };
}

function Footer({
  opened,
  busy,
  ready,
  onClose,
  onSave,
}: {
  readonly opened: Opened;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactNode {
  if (opened.created !== null) {
    return (
      <View className="flex-row justify-end gap-2">
        <Button label="Done" variant="tonal" onPress={onClose} />
      </View>
    );
  }
  return (
    <View className="flex-row justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label={opened.editing === null ? 'Make upload link' : 'Save'}
        icon={opened.editing === null ? 'link' : 'check'}
        loading={busy}
        disabled={!ready}
        onPress={onSave}
      />
    </View>
  );
}

function Body({
  opened,
  disabled,
  problem,
  footer,
  onDraft,
  onClose,
}: {
  readonly opened: Opened;
  readonly disabled: boolean;
  readonly problem: string | null;
  readonly footer: ReactNode;
  readonly onDraft: (draft: FileRequestDraft) => void;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  const content = (
    <>
      {opened.created === null ? (
        <Form opened={opened} disabled={disabled} onDraft={onDraft} />
      ) : (
        <Made created={opened.created} folder={opened.folder} />
      )}
      {problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      )}
    </>
  );
  if (sheet) return <View className="gap-4 pb-2">{content}</View>;
  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
        <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
          {sheetTitleOf(opened.folder.name, opened.editing)}
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-4 pb-4">
        {content}
      </ScrollView>
      <View className="border-t border-outline-variant px-4 py-3">{footer}</View>
    </View>
  );
}

type SetOpened = (change: (current: Opened | null) => Opened | null) => void;

function Host({
  opened,
  setOpened,
  close,
}: {
  readonly opened: Opened;
  readonly setOpened: SetOpened;
  readonly close: () => void;
}): ReactNode {
  const loose = useRef<View>(null);
  const live = useSyncStatus().status === 'live';
  const { busy, problem, save } = useSave((created) => {
    setOpened((current) => (current === null ? null : { ...current, created }));
  }, close);
  const ready = live && draftReadyOf(opened.draft);
  const footer = (
    <Footer
      opened={opened}
      busy={busy}
      ready={ready}
      onClose={close}
      onSave={() => {
        save(opened);
      }}
    />
  );
  return (
    <AdaptivePanel
      anchorRef={opened.anchorRef ?? loose}
      open
      onClose={close}
      label={sheetTitleOf(opened.folder.name, opened.editing)}
      pointerPlacement={opened.anchorRef === null ? 'center' : 'below'}
      sheetFooter={footer}
      scroll={useIdiom() === 'touch'}
      fit
    >
      <Body
        opened={opened}
        disabled={!live || busy}
        problem={problem}
        footer={footer}
        onClose={close}
        onDraft={(draft) => {
          setOpened((current) => (current === null ? null : { ...current, draft }));
        }}
      />
    </AdaptivePanel>
  );
}

export interface FileRequestSheet {
  readonly open: (folder: Folder, anchorRef?: RefObject<View | null>) => void;
  readonly edit: (request: DriveFileRequest) => void;
  readonly host: ReactNode;
}

export function useFileRequestSheet(): FileRequestSheet {
  const [opened, setOpened] = useState<Opened | null>(null);
  const close = (): void => {
    setOpened(null);
  };
  return {
    open: (folder, anchorRef): void => {
      setOpened({
        folder,
        editing: null,
        anchorRef: anchorRef ?? null,
        draft: newDraftOf(folder.name),
        created: null,
      });
    },
    edit: (request): void => {
      setOpened({
        folder: { id: request.folderItemId, name: request.folderName },
        editing: request,
        anchorRef: null,
        draft: editDraftOf(request),
        created: null,
      });
    },
    host: opened === null ? null : <Host opened={opened} setOpened={setOpened} close={close} />,
  };
}
