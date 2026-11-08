import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SmartRule } from '@smarteverything/domain';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { useSyncStatus } from '../../../store/selectors';
import { AddRuleRow } from './add-rule';
import { RuleChipRow, usePlaceOf } from './rule-chip-view';
import {
  cancelAdding,
  commitAdding,
  draftOfRule,
  draftReady,
  editAdding,
  removeChip,
  startAdding,
  type SaveMode,
  type SmartDraft,
} from './rule-chips';
import { createSmartFolder, renameSmartFolder } from './smart-data';
import { matchesText, smartFolderHref, type SmartFolder } from './smart-model';

export interface SaveSmartFolderRequest {
  readonly rule: SmartRule | null;
  readonly title: string;
  readonly matches: number | null;
  readonly from?: string;
  readonly places?: ReadonlyMap<string, string>;
  readonly anchorRef?: RefObject<View | null>;
}

interface Opened {
  readonly mode: SaveMode;
  readonly folder: SmartFolder | null;
  readonly draft: SmartDraft;
  readonly matches: number | null;
  readonly from: string | null;
  readonly places: ReadonlyMap<string, string>;
  readonly anchorRef: RefObject<View | null> | null;
}

const NO_PLACES: ReadonlyMap<string, string> = new Map();

export function openedOfRequest(request: SaveSmartFolderRequest): Opened {
  return {
    mode: 'create',
    folder: null,
    draft: draftOfRule(request.title, request.rule, 'person'),
    matches: request.matches,
    from: request.from ?? null,
    places: request.places ?? NO_PLACES,
    anchorRef: request.anchorRef ?? null,
  };
}

export function openedOfRename(
  folder: SmartFolder,
  anchorRef: RefObject<View | null> | null,
): Opened {
  return {
    mode: 'rename',
    folder,
    draft: draftOfRule(folder.title, folder.rule, folder.scope),
    matches: null,
    from: null,
    places: NO_PLACES,
    anchorRef,
  };
}

export function withDraft(opened: Opened, draft: SmartDraft): Opened {
  const sameRules = draft.chips === opened.draft.chips && draft.match === opened.draft.match;
  return { ...opened, draft, matches: sameRules ? opened.matches : null };
}

export const SMART_FOOTNOTE =
  'Smart folders sit under Starred. Nothing moves; they only show files that match.';

export function panelTitleOf(mode: SaveMode): string {
  return mode === 'create' ? 'Save as smart folder' : 'Rename smart folder';
}

type OnDraft = (draft: SmartDraft) => void;

function Adding({
  draft,
  onDraft,
}: {
  readonly draft: SmartDraft;
  readonly onDraft: OnDraft;
}): ReactNode {
  if (draft.adding === null) {
    return (
      <View className="flex-row">
        <Button
          label="Add a rule"
          icon="plus"
          variant="text"
          onPress={() => {
            onDraft(startAdding(draft, 'kind'));
          }}
        />
      </View>
    );
  }
  return (
    <AddRuleRow
      row={draft.adding}
      canCancel={draft.chips.length > 0}
      onRetype={(field) => {
        onDraft(startAdding(draft, field));
      }}
      onEdit={(row) => {
        onDraft(editAdding(draft, row));
      }}
      onAdd={() => {
        onDraft(commitAdding(draft));
      }}
      onCancel={() => {
        onDraft(cancelAdding(draft));
      }}
    />
  );
}

function Rules({
  opened,
  onDraft,
}: {
  readonly opened: Opened;
  readonly onDraft: OnDraft;
}): ReactNode {
  const { draft } = opened;
  const placeOf = usePlaceOf(opened.places);
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {draft.match === 'all' ? 'Shows files where' : 'Shows files where any of these holds'}
      </Text>
      <RuleChipRow
        chips={draft.chips}
        placeOf={placeOf}
        onRemove={(key) => {
          onDraft(removeChip(draft, key));
        }}
      />
      <Adding draft={draft} onDraft={onDraft} />
      {opened.matches === null ? null : (
        <Text variant="callout" className="tabular">
          {`${matchesText(opened.matches)} match now`}
        </Text>
      )}
    </View>
  );
}

function Form({
  opened,
  onDraft,
}: {
  readonly opened: Opened;
  readonly onDraft: OnDraft;
}): ReactNode {
  const { draft } = opened;
  return (
    <View className="gap-4">
      {opened.from === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {`From ${opened.from}`}
        </Text>
      )}
      <TextField
        label="Name"
        value={draft.title}
        focusOnMount={opened.mode === 'rename' || draft.title === ''}
        onChange={(title) => {
          onDraft({ ...draft, title });
        }}
      />
      {opened.mode === 'create' ? <Rules opened={opened} onDraft={onDraft} /> : null}
      {opened.mode === 'create' ? (
        <SwitchRow
          title="Only I see it"
          subtitle={
            draft.scope === 'person'
              ? 'Other people at home don’t see this smart folder'
              : 'Everyone at home sees it, each with the files they can open'
          }
          value={draft.scope === 'person'}
          onChange={(only) => {
            onDraft({ ...draft, scope: only ? 'person' : 'home' });
          }}
        />
      ) : null}
      {opened.mode === 'create' ? (
        <Text variant="caption" tone="variant">
          {SMART_FOOTNOTE}
        </Text>
      ) : null}
    </View>
  );
}

interface FooterProps {
  readonly opened: Opened;
  readonly busy: boolean;
  readonly live: boolean;
  readonly onClose: () => void;
  readonly onSave: () => void;
}

function Footer({ opened, busy, live, onClose, onSave }: FooterProps): ReactNode {
  return (
    <View className="flex-row justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label="Save"
        icon="sparkles"
        loading={busy}
        disabled={!live || !draftReady(opened.draft, opened.mode)}
        onPress={onSave}
      />
    </View>
  );
}

function PanelBody({
  opened,
  footer,
  onDraft,
  onClose,
}: {
  readonly opened: Opened;
  readonly footer: ReactNode;
  readonly onDraft: OnDraft;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={sheet ? 'gap-4 pb-2' : 'gap-4 p-4'}>
      {sheet ? null : (
        <View className="flex-row items-center gap-2">
          <Text variant="title-3" className="min-w-0 flex-1">
            {panelTitleOf(opened.mode)}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
      )}
      <Form opened={opened} onDraft={onDraft} />
      {sheet ? null : footer}
    </View>
  );
}

function useSave(close: () => void): {
  readonly busy: boolean;
  readonly save: (opened: Opened) => void;
} {
  const mutation = useMutationState();
  const router = useRouter();
  return {
    busy: mutation.busy,
    save: (opened): void => {
      const { folder, draft } = opened;
      mutation.run(
        () => (folder === null ? createSmartFolder(draft) : renameSmartFolder(folder, draft)),
        {
          failure: folder === null ? 'The smart folder was not saved' : 'The name was not changed',
          label: folder === null ? 'drive.smart_folder_create' : 'drive.smart_folder_rename',
          onDone: (saved) => {
            close();
            if (folder !== null) return;
            notify({
              message: `Saved ${saved.title} under Starred`,
              action: {
                label: 'Open',
                onPress: () => {
                  router.push(smartFolderHref(saved.id));
                },
              },
            });
          },
        },
      );
    },
  };
}

export interface SaveSmartFolder {
  readonly open: (request: SaveSmartFolderRequest) => void;
  readonly rename: (folder: SmartFolder, anchorRef?: RefObject<View | null>) => void;
  readonly host: ReactNode;
}

export function useSaveSmartFolder(): SaveSmartFolder {
  const [opened, setOpened] = useState<Opened | null>(null);
  const loose = useRef<View>(null);
  const live = useSyncStatus().status === 'live';
  const close = (): void => {
    setOpened(null);
  };
  const { busy, save } = useSave(close);
  const footer =
    opened === null ? null : (
      <Footer
        opened={opened}
        busy={busy}
        live={live}
        onClose={close}
        onSave={() => {
          save(opened);
        }}
      />
    );
  return {
    open: (request): void => {
      setOpened(openedOfRequest(request));
    },
    rename: (folder, anchorRef): void => {
      setOpened(openedOfRename(folder, anchorRef ?? null));
    },
    host:
      opened === null ? null : (
        <AdaptivePanel
          anchorRef={opened.anchorRef ?? loose}
          open
          onClose={close}
          label={panelTitleOf(opened.mode)}
          pointerPlacement={opened.anchorRef === null ? 'center' : 'below'}
          sheetFooter={footer}
          scroll
        >
          <PanelBody
            opened={opened}
            footer={footer}
            onClose={close}
            onDraft={(draft) => {
              setOpened(withDraft(opened, draft));
            }}
          />
        </AdaptivePanel>
      ),
  };
}
