import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Share, View } from 'react-native';
import type { DriveItem, DriveShareCreated } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { Button } from '../../../components/button';
import { CopyField } from '../../../components/copy-field';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveSettings } from '../../nas/data';
import { makeShareLink } from './share-data';
import { LinkForm, WhoSees } from './share-form';
import {
  LINKS_NOTE,
  MEMBERS_BLOCKED,
  NEW_DRAFT,
  draftReady,
  mayMakeLinks,
  reachOf,
  shareRequestOf,
  shareTitleOf,
  type ShareDraft,
} from './share-model';

export interface ShareRequest {
  readonly item: DriveItem;
  readonly anchorRef?: RefObject<View | null>;
}

interface Opened {
  readonly item: DriveItem;
  readonly anchorRef: RefObject<View | null> | null;
  readonly draft: ShareDraft;
  readonly created: DriveShareCreated | null;
}

export function openedOf(request: ShareRequest): Opened {
  return {
    item: request.item,
    anchorRef: request.anchorRef ?? null,
    draft: NEW_DRAFT,
    created: null,
  };
}

function sendElsewhere(created: DriveShareCreated, item: DriveItem): void {
  background(
    Share.share({ message: created.url, title: item.name }),
    'drive.share_link.send_failed',
  );
}

function Made({
  opened,
}: {
  readonly opened: Opened & { readonly created: DriveShareCreated };
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const { created, item } = opened;
  return (
    <View className="gap-3">
      <CopyField label="Link" value={created.url} />
      <Text variant="footnote" tone="variant">
        {reachOf(created.public)}
      </Text>
      {touch ? (
        <Button
          label="Send with another app"
          icon="share"
          variant="tonal"
          size="lg"
          grow
          onPress={() => {
            sendElsewhere(created, item);
          }}
        />
      ) : null}
    </View>
  );
}

function Body({
  opened,
  allowed,
  onDraft,
}: {
  readonly opened: Opened;
  readonly allowed: boolean;
  readonly onDraft: (draft: ShareDraft) => void;
}): ReactNode {
  const narrow = usePanelFrame().presentation === 'sheet';
  return (
    <View className="gap-4">
      <WhoSees item={opened.item} />
      <View className="h-px bg-outline-variant" />
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        Link for anyone
      </Text>
      {opened.created === null ? (
        <LinkForm draft={opened.draft} narrow={narrow} disabled={!allowed} onDraft={onDraft} />
      ) : (
        <Made opened={{ ...opened, created: opened.created }} />
      )}
      <Text variant="caption" tone="variant">
        {allowed ? LINKS_NOTE : MEMBERS_BLOCKED}
      </Text>
    </View>
  );
}

interface FooterProps {
  readonly opened: Opened;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onClose: () => void;
  readonly onMake: () => void;
}

function Footer({ opened, busy, ready, onClose, onMake }: FooterProps): ReactNode {
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
      <Button label="Make link" icon="link" loading={busy} disabled={!ready} onPress={onMake} />
    </View>
  );
}

function PanelBody({
  opened,
  allowed,
  footer,
  onDraft,
  onClose,
}: {
  readonly opened: Opened;
  readonly allowed: boolean;
  readonly footer: ReactNode;
  readonly onDraft: (draft: ShareDraft) => void;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={sheet ? 'gap-4 pb-2' : 'gap-4 p-4'}>
      {sheet ? null : (
        <View className="flex-row items-center gap-2">
          <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
            {shareTitleOf(opened.item)}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
      )}
      <Body opened={opened} allowed={allowed} onDraft={onDraft} />
      {sheet ? null : footer}
    </View>
  );
}

function useMake(onMade: (created: DriveShareCreated) => void): {
  readonly busy: boolean;
  readonly make: (opened: Opened) => void;
} {
  const mutation = useMutationState();
  const client = useQueryClient();
  return {
    busy: mutation.busy,
    make: (opened): void => {
      const request = shareRequestOf(opened.item.id, opened.draft, Date.now());
      if (request === null) return;
      mutation.run(() => makeShareLink(client, request), {
        failure: 'The link wasn’t made',
        label: 'drive.share_link_create',
        onDone: onMade,
      });
    },
  };
}

export interface ShareSheet {
  readonly open: (request: ShareRequest) => void;
  readonly host: ReactNode;
}

function useAllowed(): boolean {
  const owner = useIsOwner();
  const settings = useDriveSettings().data ?? null;
  return mayMakeLinks(owner, settings);
}

function ShareHost({
  opened,
  setOpened,
  close,
}: {
  readonly opened: Opened;
  readonly setOpened: (change: (current: Opened | null) => Opened | null) => void;
  readonly close: () => void;
}): ReactNode {
  const loose = useRef<View>(null);
  const live = useSyncStatus().status === 'live';
  const allowed = useAllowed();
  const { busy, make } = useMake((created) => {
    setOpened((current) => (current === null ? null : { ...current, created }));
  });
  const ready = live && allowed && draftReady(opened.draft);
  const footer = (
    <Footer
      opened={opened}
      busy={busy}
      ready={ready}
      onClose={close}
      onMake={() => {
        make(opened);
      }}
    />
  );
  return (
    <AdaptivePanel
      anchorRef={opened.anchorRef ?? loose}
      open
      onClose={close}
      label={shareTitleOf(opened.item)}
      pointerPlacement={opened.anchorRef === null ? 'center' : 'below'}
      sheetFooter={footer}
      scroll
    >
      <PanelBody
        opened={opened}
        allowed={allowed}
        footer={footer}
        onClose={close}
        onDraft={(draft) => {
          setOpened((current) => (current === null ? null : { ...current, draft }));
        }}
      />
    </AdaptivePanel>
  );
}

export function useShareSheet(): ShareSheet {
  const [opened, setOpened] = useState<Opened | null>(null);
  const close = (): void => {
    setOpened(null);
  };
  return {
    open: (request): void => {
      setOpened(openedOf(request));
    },
    host:
      opened === null ? null : <ShareHost opened={opened} setOpened={setOpened} close={close} />,
  };
}
