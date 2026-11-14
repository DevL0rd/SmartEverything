import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LibraryScope } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { ThemeScope } from '../../../design/theme-scope';
import { useDayKey } from '../../../store/clock';
import { closeViewer } from './close';
import { DesktopHeader, PhoneActions, PhoneHeader } from './header';
import { desktopHeaderText, phoneHeaderText } from './header-text';
import { InfoPanel, InfoSheet } from './info-panel';
import { useViewerKeys } from './keys';
import { usePrefetchNeighbours } from './photo';
import { StackStrip } from './stack-strip';
import { ViewerStage } from './stage';
import { useViewerControls, type ViewerControls } from './use-viewer-controls';
import type { ViewerItem } from './use-viewer-item';
import { useViewerSequence } from './use-viewer-sequence';
import type { ViewerSequence } from './sequence';

const KEY_HINTS = 'Arrows browse · F favourite · I info · Esc closes';

type ReadyItem = Extract<ViewerItem, { readonly state: 'ready' }>;

export interface ReadyViewerProps {
  readonly viewer: ReadyItem;
  readonly scope: LibraryScope;
  readonly phone: boolean;
  readonly infoOpen: boolean;
  readonly onInfo: () => void;
  readonly onOpen: (itemId: string) => void;
  readonly onGo: (tile: MediaTile) => void;
}

function Strip({
  ready,
  controls,
  compact,
}: {
  readonly ready: ReadyViewerProps;
  readonly controls: ViewerControls;
  readonly compact: boolean;
}): ReactNode {
  const stackId = ready.viewer.media?.stackId ?? null;
  if (stackId === null) return null;
  return (
    <StackStrip
      stackId={stackId}
      currentId={ready.viewer.item.id}
      compact={compact}
      busy={controls.actions.busy}
      onOpen={ready.onOpen}
      onMakeCover={controls.actions.makeCover}
    />
  );
}

function useReady(props: ReadyViewerProps): {
  readonly sequence: ViewerSequence;
  readonly controls: ViewerControls;
} {
  const { viewer } = props;
  const sequence = useViewerSequence(viewer.item.id, viewer.month, props.scope);
  const controls = useViewerControls({
    item: viewer.item,
    media: viewer.media,
    place: viewer.place,
    library: viewer.library,
    sequence,
    infoOpen: props.infoOpen,
    onInfo: props.onInfo,
    onOpen: props.onOpen,
    onClose: closeViewer,
  });
  usePrefetchNeighbours(sequence.previous, sequence.next);
  useViewerKeys(true, (action) => {
    if (action === 'info') props.onInfo();
    else if (action === 'favourite') controls.actions.favourite();
    else {
      const tile = action === 'next' ? sequence.next : sequence.previous;
      if (tile !== null) props.onGo(tile);
    }
  });
  return { sequence, controls };
}

function Stage({
  ready,
  sequence,
}: {
  readonly ready: ReadyViewerProps;
  readonly sequence: ViewerSequence;
}): ReactNode {
  return (
    <ViewerStage
      item={ready.viewer.item}
      media={ready.viewer.media}
      tile={sequence.current}
      touch={ready.phone}
      moves={{
        previous: sequence.previous,
        next: sequence.next,
        onGo: ready.onGo,
        onClose: closeViewer,
      }}
    />
  );
}

export function ReadyViewer(props: ReadyViewerProps): ReactNode {
  const { sequence, controls } = useReady(props);
  const today = useDayKey();
  const input = {
    item: props.viewer.item,
    offsetMin: props.viewer.media?.tzOffsetMin ?? null,
    place: props.viewer.place,
    day: sequence.day,
    today,
  };
  if (props.phone) {
    return (
      <View className="flex-1">
        <ThemeScope theme="dark">
          <View className="flex-1 bg-black">
            <PhoneHeader text={phoneHeaderText(input)} controls={controls.header} />
            <Stage ready={props} sequence={sequence} />
            <Strip ready={props} controls={controls} compact />
            <PhoneActions controls={controls.header} />
          </View>
        </ThemeScope>
        <InfoSheet open={props.infoOpen} content={controls.info} onClose={props.onInfo} />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row">
      <ThemeScope theme="dark">
        <View className="min-w-0 flex-1 bg-black">
          <DesktopHeader text={desktopHeaderText(input)} controls={controls.header} />
          <Stage ready={props} sequence={sequence} />
          <Strip ready={props} controls={controls} compact={false} />
          <Text variant="caption" tone="variant" align="center" className="px-4 pb-4">
            {KEY_HINTS}
          </Text>
        </View>
      </ThemeScope>
      {props.infoOpen ? <InfoPanel content={controls.info} onClose={props.onInfo} /> : null}
    </View>
  );
}
