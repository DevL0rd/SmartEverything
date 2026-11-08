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
import { libraryLayoutOf } from '../../nas/frame/sections';
import { runChange } from '../folder/folder-footer';
import { entryKindOf } from '../folder/folder-list';
import type { FolderSlotContext } from '../folder/folder-model';
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
  close,
}: {
  readonly subject: DetailsSubject | null;
  readonly slots: DetailsSlots;
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
      <DetailsTabs subject={subject} slots={slots} pane />
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

function useSubject(context: FolderSlotContext): DetailsSubject | null {
  const online = useSyncStatus().status === 'live';
  const item = subjectOf(context);
  if (item === null) return null;
  return { root: context.root, item, writable: online && !context.root.readOnly };
}

export function DetailsPane({
  context,
  slots,
}: {
  readonly context: FolderSlotContext;
  readonly slots: DetailsSlots;
}): ReactNode {
  const subject = useSubject(context);
  const presentation = presentationOf(libraryLayoutOf(useAreaWidth()), useWindowDimensions().width);
  const { close } = context;
  if (presentation === 'pull-up') {
    return subject === null ? null : <ItemPullUp subject={subject} slots={slots} close={close} />;
  }
  const body = <PaneBody subject={subject} slots={slots} close={close} />;
  return presentation === 'docked' ? (
    <Docked close={close}>{body}</Docked>
  ) : (
    <SideSheet close={close}>{body}</SideSheet>
  );
}

export function detailsSlotOf(slots: DetailsSlots): (context: FolderSlotContext) => ReactNode {
  return function DetailsSlot(context) {
    return <DetailsPane context={context} slots={slots} />;
  };
}
