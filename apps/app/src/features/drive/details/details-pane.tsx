import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import type { DriveItem } from '@smarteverything/domain';
import { DockedPane } from '../../../components/docked-pane';
import { EmptyState } from '../../../components/empty-state';
import { FileGlyph } from '../../../components/files/file-glyph';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { DURATION, EASING, entering, exiting, useMotion } from '../../../design/motion';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveOf } from '../data';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { runChange } from '../folder/folder-footer';
import { entryKindOf } from '../folder/folder-list';
import type { FolderSlotContext } from '../folder/folder-model';
import { canWrite } from '../model/drive-access';
import { useShareSheet } from '../share';
import { DetailsTabs } from './details-tabs';
import {
  DETAILS_WIDTH,
  presentationOf,
  setPaneWidth,
  subjectOf,
  usePaneWidth,
  type DetailsSlots,
  type DetailsSubject,
} from './details-model';
import { ItemPullUp } from './item-pull-up';

const LABEL = 'Details';

const SLIDE_IN = SlideInRight.duration(DURATION.mediumOut).easing(EASING.standard);

const SLIDE_OUT = SlideOutRight.duration(DURATION.mediumOut).easing(EASING.standard);

const SCRIM_IN = FadeIn.duration(DURATION.mediumOut);

const SCRIM_OUT = FadeOut.duration(DURATION.mediumOut);

function PaneHeader({
  item,
  close,
}: {
  readonly item: DriveItem;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2 pb-1 pl-4 pr-2 pt-2">
      <FileGlyph kind={entryKindOf(item)} name={item.name} />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {item.name}
      </Text>
      <IconButton
        icon="star"
        label={item.starred ? 'Remove star' : 'Star'}
        selected={item.starred}
        tone={item.starred ? 'primary' : 'variant'}
        onPress={() => {
          runChange(
            { action: item.starred ? 'unstar' : 'star', itemIds: [item.id] },
            'Could not change the star.',
          );
        }}
      />
      <IconButton icon="close" label="Close details" shortcut="I" onPress={close} />
    </View>
  );
}

function PaneBody({
  subject,
  slots,
  share,
  close,
}: {
  readonly subject: DetailsSubject | null;
  readonly slots: DetailsSlots;
  readonly share: (item: DriveItem) => void;
  readonly close: () => void;
}): ReactNode {
  if (subject === null) {
    return (
      <View className="flex-1 justify-center p-4">
        <EmptyState
          compact
          icon="info"
          title="Nothing picked"
          body="Pick a file or folder to see where it is, who sees it and how it changed."
        />
      </View>
    );
  }
  return (
    <>
      <PaneHeader item={subject.item} close={close} />
      <DetailsTabs subject={subject} slots={slots} share={share} pane />
    </>
  );
}

function Docked({
  close,
  children,
}: {
  readonly close: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const motion = useMotion();
  return (
    <DockedPane
      side="right"
      label={LABEL}
      open
      width={usePaneWidth()}
      minWidth={DETAILS_WIDTH.min}
      maxWidth={DETAILS_WIDTH.max}
      onResize={setPaneWidth}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Animated.View
        {...entering(motion, SLIDE_IN)}
        role="complementary"
        aria-label={LABEL}
        className="h-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-chrome"
      >
        {children}
      </Animated.View>
    </DockedPane>
  );
}

function SideSheet({
  close,
  children,
}: {
  readonly close: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const motion = useMotion();
  useEscape(true, close);
  return (
    <View className="absolute inset-0 z-20" pointerEvents="box-none">
      <Animated.View
        {...entering(motion, SCRIM_IN)}
        {...exiting(motion, SCRIM_OUT)}
        className="absolute inset-0"
      >
        <Pressable accessibilityLabel="Close details" onPress={close} className="flex-1 bg-scrim" />
      </Animated.View>
      <Animated.View
        {...entering(motion, SLIDE_IN)}
        {...exiting(motion, SLIDE_OUT)}
        role="dialog"
        aria-label={LABEL}
        className="absolute inset-y-0 right-0 w-90 max-w-full overflow-hidden rounded-l-lg border-l border-outline-variant bg-chrome elevation-2"
      >
        {children}
      </Animated.View>
    </View>
  );
}

const SHARED_WITH_ME = 'Shared with me';

export function useDetailsSubject(item: DriveItem | null): DetailsSubject | null {
  const online = useSyncStatus().status === 'live';
  const drive = useDriveOf(item);
  if (item === null || drive.root === null) return null;
  return {
    root: drive.root,
    item,
    label: drive.label ?? SHARED_WITH_ME,
    access: drive.access,
    writable: online && canWrite(drive.access),
  };
}

export function DetailsPane({
  context,
  slots,
}: {
  readonly context: FolderSlotContext;
  readonly slots: DetailsSlots;
}): ReactNode {
  const subject = useDetailsSubject(subjectOf(context));
  const presentation = presentationOf(libraryLayoutOf(useAreaWidth()), useWindowDimensions().width);
  const sheet = useShareSheet();
  const share = (item: DriveItem): void => {
    sheet.open({ item });
  };
  const { close } = context;
  if (presentation === 'pull-up') {
    if (subject === null) return null;
    return (
      <>
        <ItemPullUp subject={subject} slots={slots} share={share} close={close} />
        {sheet.host}
      </>
    );
  }
  const body = <PaneBody subject={subject} slots={slots} share={share} close={close} />;
  return (
    <>
      {presentation === 'docked' ? (
        <Docked close={close}>{body}</Docked>
      ) : (
        <SideSheet close={close}>{body}</SideSheet>
      )}
      {sheet.host}
    </>
  );
}

export function detailsSlotOf(slots: DetailsSlots): (context: FolderSlotContext) => ReactNode {
  return function DetailsSlot(context) {
    return <DetailsPane context={context} slots={slots} />;
  };
}
