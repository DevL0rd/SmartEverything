import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { View } from 'react-native';
import { makeMutable, useAnimatedRef } from 'react-native-reanimated';
import { describe, expect, it, vi } from 'vitest';
import { WidgetMotionFrameContext } from '../../../components/widget-board/widget-scope';
import { fanSpec } from '../visual/visual-fixture';
import type { ScrollLayer } from './scroll-model-layer';
import type { LiveModelViewProps } from './use-live-view';

function pass({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

function shared<Value>(value: Value): { readonly get: () => Value } {
  return { get: () => value };
}

const preview = vi.hoisted((): { layer: ScrollLayer | null } => ({ layer: null }));

vi.mock('react-native-reanimated', () => ({
  default: { View: pass },
  makeMutable: shared,
  useAnimatedRef: (): null => null,
  useSharedValue: shared,
}));
vi.mock('../../../design/animation-gate', () => ({ useForeground: (): boolean => true }));
vi.mock('./live-overlay', () => ({ default: (): null => null }));
vi.mock('./native-model-face', () => ({ NativeModelFace: (): null => null }));
vi.mock('./use-live-view', () => ({}));
vi.mock('./scroll-model-view', () => ({
  ScrollModelView: ({ layer }: { readonly layer: ScrollLayer }): null => {
    preview.layer = layer;
    return null;
  },
}));

const { LiveModelView } = await import('./live-view');

function EditingWidget(props: LiveModelViewProps): ReactNode {
  const ref = useAnimatedRef<View>();
  return createElement(
    WidgetMotionFrameContext,
    { value: { ref, top: makeMutable(100) } },
    createElement(LiveModelView, props),
  );
}

describe('the editing widget model', () => {
  it('paints within its own slot regardless of the ancestor transformation', () => {
    const props: LiveModelViewProps = {
      id: 'fan',
      spec: fanSpec(),
      model: { specHash: 'fan', lod: 0, finish: null, params: {} },
      view: 'card',
      px: 96,
      signals: { speed: 0.5 },
      still: null,
    };
    renderToStaticMarkup(createElement(EditingWidget, props));
    const { layer } = preview;
    if (layer === null) throw new Error('Expected a renderer inside the editing widget');
    const { spec, model, view, signals, id } = props;
    const leave = layer.surface.join(id, {
      spec,
      model,
      view,
      signals,
      theme: 'dark',
      reduced: false,
      functioning: true,
    });
    try {
      layer.surface.set.report(id, { onScreen: true, screenFocused: true });
      layer.place(id, { x: 7, y: 11, width: 120, height: 120 });
      const slot = { x: 0, y: 0, width: 96, height: 96 };
      expect(layer.placements({ width: 96, height: 96 }, 3).placements).toEqual({
        fan: { rect: slot, clip: slot },
      });
    } finally {
      leave();
    }
  });
});
