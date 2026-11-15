import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { DockedPane } from '../../../components/docked-pane';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { DURATION, EASING, entering, exiting, useMotion } from '../../../design/motion';
import { useAreaWidth, useWindowSize } from '../../../design/size-class';
import type { FileNode } from '../source/types';
import { DETAILS_WIDTH, presentationOf, setPaneWidth, usePaneWidth } from './details-model';
import type { DetailsHost, DetailsProps } from './details-host';
import { DetailsTabs } from './details-tabs';
import { ItemPullUp } from './item-pull-up';
import { NodeGlyph } from './node-glyph';

const LABEL = 'Details';

const SLIDE_IN = SlideInRight.duration(DURATION.mediumOut).easing(EASING.standard);

const SLIDE_OUT = SlideOutRight.duration(DURATION.mediumOut).easing(EASING.standard);

const SCRIM_IN = FadeIn.duration(DURATION.mediumOut);

const SCRIM_OUT = FadeOut.duration(DURATION.mediumOut);

function PaneHeader<O>({ node, host }: DetailsProps<O>): ReactNode {
  const { icon } = host.source.useLinks(node);
  const starred = node.marks.starred;
  return (
    <View className="flex-row items-center gap-2 pb-1 pl-4 pr-2 pt-2">
      <NodeGlyph node={node} icon={icon} />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {node.name}
      </Text>
      {host.abilities.star ? (
        <IconButton
          icon="star"
          label={starred ? 'Remove star' : 'Star'}
          selected={starred}
          tone={starred ? 'primary' : 'variant'}
          onPress={() => {
            host.act(starred ? 'unstar' : 'star', [node]);
          }}
        />
      ) : null}
      <IconButton icon="close" label="Close details" shortcut="I" onPress={host.close} />
    </View>
  );
}

function PaneBody<O>({
  node,
  host,
}: {
  readonly node: FileNode<O> | null;
  readonly host: DetailsHost<O>;
}): ReactNode {
  if (node === null) {
    return (
      <View className="flex-1 justify-center p-4">
        <EmptyState
          compact
          icon="info"
          title="Nothing picked"
          body="Pick a file or folder to see what it is, where it is and what you can do with it."
        />
      </View>
    );
  }
  return (
    <>
      <PaneHeader node={node} host={host} />
      <DetailsTabs node={node} host={host} pane />
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
    <View className="absolute inset-0 z-20 overflow-hidden" pointerEvents="box-none">
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

export function DetailsPane<O>({
  node,
  host,
}: {
  readonly node: FileNode<O> | null;
  readonly host: DetailsHost<O>;
}): ReactNode {
  const presentation = presentationOf(libraryLayoutOf(useAreaWidth()), useWindowSize().width);
  if (presentation === 'pull-up') {
    return node === null ? null : <ItemPullUp node={node} host={host} />;
  }
  const body = <PaneBody node={node} host={host} />;
  return presentation === 'docked' ? (
    <Docked close={host.close}>{body}</Docked>
  ) : (
    <SideSheet close={host.close}>{body}</SideSheet>
  );
}
