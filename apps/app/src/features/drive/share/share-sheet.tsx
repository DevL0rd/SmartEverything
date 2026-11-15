import { useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { ScrollView, Share, View } from 'react-native';
import type { DriveItem, DriveShareCreated } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { Button } from '../../../components/button';
import { CopyField } from '../../../components/copy-field';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { SHELL_BREAKPOINTS } from '../../../components/page-shell/layout';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { notifyFailure } from '../../../components/toast-store';
import { useProfiles } from '../../../store/people';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveOf, useDriveSettings } from '../data';
import type { DriveOfItem } from '../model/drive-access';
import { revokeLink } from '../shared/revoke-link';
import { useItemSubject } from '../source/drive-tabs';
import { PeopleSection, SectionTitle } from './people-section';
import { RequestsSection } from './requests-section';
import { TransferSection } from './transfer-section';
import { PeopleLink, ViewOnlyRow } from './view-only-row';
import { ActiveLinks, useItemLinks, type ItemLinks } from './sharing-tab';
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
  viewOnlyShownOf,
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

function LinkPart({
  opened,
  link,
  links,
  onDraft,
  onStopped,
}: Omit<BodyProps, 'drive'> & { readonly links: ItemLinks }): ReactNode {
  const narrow = useAreaWidth() < SHELL_BREAKPOINTS.compactMax;
  if (link !== 'allowed') {
    return (
      <Text variant="footnote" tone="variant">
        {LINK_STATE_LINE[link]}
      </Text>
    );
  }
  return (
    <>
      <ActiveLinks item={opened.item} links={links} />
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

function withDividers(sections: readonly (ReactElement | null)[]): ReactNode {
  return sections
    .filter((section) => section !== null)
    .map((section, index) => (
      <Fragment key={section.key}>
        {index === 0 ? null : <View className="h-px bg-outline-variant" />}
        {section}
      </Fragment>
    ));
}

function Body(props: BodyProps): ReactNode {
  const { opened, drive } = props;
  const ownerProfileId = useItemSubject(opened.item)?.ownerProfileId ?? null;
  const owner = useProfiles().find((profile) => profile.id === ownerProfileId);
  const links = useItemLinks(opened.item.id, useMinute());
  return (
    <View className="gap-4">
      <RequestsSection itemId={opened.item.id} />
      {withDividers([
        <PeopleSection
          key="people"
          item={opened.item}
          ownerProfileId={ownerProfileId}
          access={drive.access}
        />,
        viewOnlyShownOf(drive.access) ? (
          <ViewOnlyRow key="view-only" item={opened.item} access={drive.access} />
        ) : null,
        props.link === 'owner-only' ? null : (
          <View key="link" className="gap-4">
            <SectionTitle text="Link" />
            <LinkPart {...props} links={links} />
          </View>
        ),
        <PeopleLink key="people-link" itemId={opened.item.id} access={drive.access} />,
        drive.access === 'own' ? (
          <TransferSection key="transfer" item={opened.item} access={drive.access} />
        ) : null,
      ])}
      {links.groups === null ? null : (
        <Text variant="footnote" tone="variant">
          {footerLineOf(drive.access, owner?.name ?? null, links.groups.active.length)}
        </Text>
      )}
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
      <Button
        label="Make link"
        icon="link"
        variant="tonal"
        loading={busy}
        disabled={!ready}
        onPress={onMake}
      />
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
  if (sheet) {
    return (
      <View className="gap-4 pb-2">
        <Body {...body} />
      </View>
    );
  }
  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
        <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
          {shareTitleOf(body.opened.item)}
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-4 pb-4">
        <Body {...body} />
      </ScrollView>
      <View className="border-t border-outline-variant px-4 py-3">{footer}</View>
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
  const touch = useIdiom() === 'touch';
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
      scroll={touch}
      fit
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
