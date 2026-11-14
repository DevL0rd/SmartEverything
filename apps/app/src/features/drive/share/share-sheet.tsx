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
import { notifyFailure } from '../../../components/toast-store';
import { useProfiles } from '../../../store/people';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveOf, useDriveSettings } from '../data';
import type { DriveOfItem } from '../model/drive-access';
import { revokeLink } from '../shared/revoke-link';
import { PeopleSection, SectionTitle } from './people-section';
import { makeShareLink } from './share-data';
import { LinkForm } from './share-form';
import {
  LINKS_NOTE,
  LINK_STATE_LINE,
  NEW_DRAFT,
  draftReady,
  footerLineOf,
  linkStateOf,
  reachOf,
  shareRequestOf,
  shareTitleOf,
  type LinkState,
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
  onStopped,
}: {
  readonly opened: Opened & { readonly created: DriveShareCreated };
  readonly onStopped: () => void;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  const { created, item } = opened;
  const stop = (): void => {
    revokeLink(client, created.share.id, item.name)
      .then((stopped) => {
        if (stopped) onStopped();
      })
      .catch(notifyFailure('The link wasn’t stopped'));
  };
  return (
    <View className="gap-3">
      <CopyField label="Link" value={created.url} />
      <Text variant="footnote" tone="variant">
        {reachOf(created.public)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {touch ? (
          <Button
            label="Send with another app"
            icon="share"
            variant="tonal"
            grow
            onPress={() => {
              sendElsewhere(created, item);
            }}
          />
        ) : null}
        <Button
          label="Stop link"
          icon="unlink"
          variant="destructive"
          disabled={!live}
          onPress={stop}
        />
      </View>
    </View>
  );
}

interface BodyProps {
  readonly opened: Opened;
  readonly drive: DriveOfItem;
  readonly link: LinkState;
  readonly onDraft: (draft: ShareDraft) => void;
  readonly onStopped: () => void;
}

function LinkPart({ opened, link, onDraft, onStopped }: Omit<BodyProps, 'drive'>): ReactNode {
  const narrow = usePanelFrame().presentation === 'sheet';
  if (link !== 'allowed') {
    return (
      <Text variant="footnote" tone="variant">
        {LINK_STATE_LINE[link]}
      </Text>
    );
  }
  return (
    <>
      {opened.created === null ? (
        <LinkForm draft={opened.draft} narrow={narrow} disabled={false} onDraft={onDraft} />
      ) : (
        <Made opened={{ ...opened, created: opened.created }} onStopped={onStopped} />
      )}
      <Text variant="caption" tone="variant">
        {LINKS_NOTE}
      </Text>
    </>
  );
}

function Body(props: BodyProps): ReactNode {
  const { opened, drive } = props;
  const owner = useProfiles().find((profile) => profile.id === drive.root?.ownerProfileId);
  return (
    <View className="gap-4">
      {drive.root === null ? null : (
        <PeopleSection item={opened.item} root={drive.root} access={drive.access} />
      )}
      <View className="h-px bg-outline-variant" />
      {props.link === 'owner-only' ? null : (
        <>
          <SectionTitle text="Link" />
          <LinkPart {...props} />
          <View className="h-px bg-outline-variant" />
        </>
      )}
      <Text variant="footnote" tone="variant">
        {footerLineOf(drive.access, owner?.name ?? null)}
      </Text>
    </View>
  );
}

interface FooterProps {
  readonly opened: Opened;
  readonly link: LinkState;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onClose: () => void;
  readonly onMake: () => void;
}

function Footer({ opened, link, busy, ready, onClose, onMake }: FooterProps): ReactNode {
  if (opened.created !== null || link !== 'allowed') {
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
  body,
  footer,
  onClose,
}: {
  readonly body: BodyProps;
  readonly footer: ReactNode;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={sheet ? 'gap-4 pb-2' : 'gap-4 p-4'}>
      {sheet ? null : (
        <View className="flex-row items-center gap-2">
          <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
            {shareTitleOf(body.opened.item)}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
      )}
      <Body {...body} />
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

function useLinkState(drive: DriveOfItem): LinkState {
  const owner = useIsOwner();
  const settings = useDriveSettings().data ?? null;
  return linkStateOf(drive.access, owner, settings);
}

type SetOpened = (change: (current: Opened | null) => Opened | null) => void;

function bodyOf(
  opened: Opened,
  drive: DriveOfItem,
  link: LinkState,
  setOpened: SetOpened,
): BodyProps {
  return {
    opened,
    drive,
    link,
    onDraft: (draft): void => {
      setOpened((current) => (current === null ? null : { ...current, draft }));
    },
    onStopped: (): void => {
      setOpened((current) => (current === null ? null : { ...current, created: null }));
    },
  };
}

function ShareHost({
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
  const drive = useDriveOf(opened.item);
  const link = useLinkState(drive);
  const { busy, make } = useMake((created) => {
    setOpened((current) => (current === null ? null : { ...current, created }));
  });
  const ready = live && link === 'allowed' && draftReady(opened.draft);
  const footer = (
    <Footer
      opened={opened}
      link={link}
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
      <PanelBody body={bodyOf(opened, drive, link, setOpened)} footer={footer} onClose={close} />
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
