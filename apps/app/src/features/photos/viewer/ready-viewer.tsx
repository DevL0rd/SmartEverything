import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { LibraryScope } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { ThemeScope } from '../../../design/theme-scope';
import { useDayKey } from '../../../store/clock';
import { closeViewer } from './close';
import {
  CompactControls,
  DesktopControls,
  PhoneActions,
  PhoneControls,
  ViewerHeading,
  type HeaderControls,
  type HeaderText,
} from './header';
import {
  desktopHeaderText,
  headerFormOf,
  phoneHeaderText,
  type HeaderForm,
  type HeaderInput,
} from './header-text';
import { InfoPanel, InfoSheet } from './info-panel';
import { useViewerKeys } from './keys';
import { usePrefetchNeighbours } from './photo';
import { StackStrip } from './stack-strip';
import { ViewerStage } from './stage';
import { useViewerControls, type ViewerControls } from './use-viewer-controls';
import type { ViewerItem } from './use-viewer-item';
import { useViewerSequence } from './use-viewer-sequence';
import type { ViewerFrom } from './params';
import type { ViewerSequence } from './sequence';

const KEY_HINTS = 'Arrows browse · F favourite · E edit · I info · Esc closes';

type ReadyItem = Extract<ViewerItem, { readonly state: 'ready' }>;

export interface ReadyViewerProps {
  readonly viewer: ReadyItem;
  readonly scope: LibraryScope;
  readonly from: ViewerFrom;
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

function editWithKey(controls: ViewerControls): void {
  const { edit } = controls.header;
  if (edit.available && !edit.busy && !controls.header.busy) edit.onEdit();
}

function useReady(props: ReadyViewerProps): {
  readonly sequence: ViewerSequence;
  readonly controls: ViewerControls;
} {
  const { viewer } = props;
  const sequence = useViewerSequence(viewer.item.id, viewer.month, {
    scope: props.scope,
    from: props.from,
  });
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
  useViewerKeys(useIsFocused(), (action) => {
    if (action === 'info') props.onInfo();
    else if (action === 'favourite') controls.actions.favourite();
    else if (action === 'edit') editWithKey(controls);
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
      touch={ready.phone}
      floating={ready.phone}
      moves={{
        previous: sequence.previous,
        next: sequence.next,
        onGo: ready.onGo,
        onClose: closeViewer,
      }}
    />
  );
}

function Trailing({
  form,
  controls,
}: {
  readonly form: HeaderForm;
  readonly controls: HeaderControls;
}): ReactNode {
  if (form === 'phone') return <PhoneControls controls={controls} />;
  if (form === 'compact') return <CompactControls controls={controls} />;
  return <DesktopControls controls={controls} />;
}

function ViewerShell({
  text,
  controls,
  form,
  children,
}: {
  readonly text: HeaderText;
  readonly controls: HeaderControls;
  readonly form: HeaderForm;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PageShell
      variant="overlay"
      title={text.title}
      heading={<ViewerHeading text={text} />}
      onBack={controls.onClose}
      trailing={<Trailing form={form} controls={controls} />}
    >
      {children}
    </PageShell>
  );
}

function KeyHints(): ReactNode {
  if (useIdiom() !== 'pointer') return null;
  return (
    <Text variant="caption" tone="variant" align="center" className="px-4 pb-4">
      {KEY_HINTS}
    </Text>
  );
}

function WideViewer({
  ready,
  sequence,
  controls,
  input,
}: {
  readonly ready: ReadyViewerProps;
  readonly sequence: ViewerSequence;
  readonly controls: ViewerControls;
  readonly input: HeaderInput;
}): ReactNode {
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  const form = headerFormOf(false, stageWidth);
  return (
    <View className="flex-1 flex-row">
      <ThemeScope theme="dark">
        <View
          className="min-w-0 flex-1 bg-black"
          onLayout={(event) => {
            setStageWidth(event.nativeEvent.layout.width);
          }}
        >
          <ViewerShell
            text={form === 'compact' ? phoneHeaderText(input) : desktopHeaderText(input)}
            controls={controls.header}
            form={form}
          >
            <Stage ready={ready} sequence={sequence} />
            <Strip ready={ready} controls={controls} compact={false} />
            <KeyHints />
          </ViewerShell>
        </View>
      </ThemeScope>
      {ready.infoOpen ? <InfoPanel content={controls.info} onClose={ready.onInfo} /> : null}
    </View>
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
  if (!props.phone) {
    return <WideViewer ready={props} sequence={sequence} controls={controls} input={input} />;
  }
  return (
    <View className="flex-1">
      <ThemeScope theme="dark">
        <View className="flex-1 bg-black">
          <ViewerShell text={phoneHeaderText(input)} controls={controls.header} form="phone">
            <Stage ready={props} sequence={sequence} />
            <Strip ready={props} controls={controls} compact />
            <PhoneActions controls={controls.header} />
          </ViewerShell>
        </View>
      </ThemeScope>
      <InfoSheet open={props.infoOpen} content={controls.info} onClose={props.onInfo} />
    </View>
  );
}
