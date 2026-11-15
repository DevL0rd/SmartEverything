import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent } from 'react-native';
import type { PhotoRecipe } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { SINGLE_VIEW, type CanvasPatch, type CanvasStatus } from './canvas-protocol';
import { shownView, type ShownStage } from './canvas-view';
import { insetFit, type Rect, type Size } from './geometry';
import PhotoCanvas from './photo-canvas';

const log = new Logger('app.photos');

const FILL = { width: '100%', height: '100%' } as const;

export const STAGE_PAD = 24;

export type Overlay = (rect: Rect, shown: Size) => ReactNode;

export interface EditorStageProps {
  readonly uri: string;
  readonly patches: readonly CanvasPatch[];
  readonly recipe: PhotoRecipe;
  readonly stage: ShownStage;
  readonly source: Size;
  readonly label: string;
  readonly overlay: Overlay | null;
  readonly onSource: (size: Size) => void;
}

const PROBLEM: Readonly<Record<CanvasStatus, { readonly title: string; readonly body: string }>> = {
  failed: {
    title: 'The photo did not load',
    body: 'Check the connection to the hub and try again.',
  },
  lost: {
    title: 'The editor stopped drawing',
    body: 'The device took the graphics back. Your edits are kept.',
  },
  'no-webgl': {
    title: 'This device cannot draw the editor',
    body: 'The editor needs WebGL, which this device does not give.',
  },
};

function Problem({
  status,
  onRetry,
}: {
  readonly status: CanvasStatus;
  readonly onRetry: () => void;
}): ReactNode {
  const text = PROBLEM[status];
  return (
    <View className="absolute inset-0 items-center justify-center gap-3 bg-black/70 px-6">
      <Icon name="alert" size={32} tone="variant" />
      <Text variant="label" align="center">
        {text.title}
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-reading">
        {text.body}
      </Text>
      {status === 'no-webgl' ? null : (
        <Button label="Try again" icon="refresh" variant="tonal" onPress={onRetry} />
      )}
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View
      className="absolute inset-0 items-center justify-center gap-3"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the original"
    >
      <ActivityIndicator size="large" colorClassName="accent-primary" />
      <Text variant="callout" tone="variant">
        Loading the original
      </Text>
    </View>
  );
}

function sizeOf(event: LayoutChangeEvent): Size {
  return { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
}

type StageStatus = CanvasStatus | 'loading' | 'shown';

function StatusLayer({
  status,
  onRetry,
}: {
  readonly status: StageStatus;
  readonly onRetry: () => void;
}): ReactNode {
  if (status === 'shown') return null;
  if (status === 'loading') return <Loading />;
  return <Problem status={status} onRetry={onRetry} />;
}

export function EditorStage(props: EditorStageProps): ReactNode {
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const [status, setStatus] = useState<StageStatus>('loading');
  const [generation, setGeneration] = useState(0);
  const shown = shownView(props.recipe, props.source, props.stage);
  const rect = insetFit(frame, shown.size, STAGE_PAD);
  return (
    <View
      className="min-h-0 flex-1 overflow-hidden"
      onLayout={(event) => {
        setFrame(sizeOf(event));
      }}
    >
      <View className="absolute" style={rect}>
        <PhotoCanvas
          key={generation}
          uri={props.uri}
          patches={props.patches}
          views={[shown.view]}
          grid={SINGLE_VIEW}
          label={props.label}
          onStatus={(next, detail) => {
            log.warn('editor.canvas_problem', { status: next, detail });
            setStatus(next);
            return Promise.resolve();
          }}
          onLoaded={(width, height) => {
            setStatus('shown');
            props.onSource({ width, height });
            return Promise.resolve();
          }}
          dom={{ style: FILL, scrollEnabled: false }}
        />
      </View>
      {status === 'shown' && props.overlay !== null ? (
        <View className="absolute" style={rect}>
          {props.overlay(rect, shown.size)}
        </View>
      ) : null}
      <StatusLayer
        status={status}
        onRetry={() => {
          setStatus('loading');
          setGeneration((value) => value + 1);
        }}
      />
    </View>
  );
}
