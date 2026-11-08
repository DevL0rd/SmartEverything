import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Rect } from '../../../../components/anchor';
import { appPlatform } from '../../../../design/platform';
import {
  chooseFacing,
  pauseCamera,
  setCameraLight,
  stopCamera,
  stopSharing,
} from '../call-actions';
import { callEngine } from '../engine/engine';
import { cameraMenuOf, shareMenuOf, type CallMenuAction } from '../model/call-menus';
import { HOME_PICKER, WINDOW_PICKER, type CallPage } from '../use-call-layers';
import type { CallRoomModel } from '../use-call-room';
import { CallMenu, measureMenuAnchor } from './call-menu';
import { CallPageSheet } from './call-page-sheet';

function useMenuRect(model: CallRoomModel, which: 'camera' | 'share'): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const open = model.layers.layer?.kind === 'menu' && model.layers.layer.which === which;
  const anchor = which === 'camera' ? model.cameraAnchor : model.shareAnchor;
  useEffect(() => {
    if (open) {
      measureMenuAnchor(anchor, setRect);
    }
  }, [open, anchor]);
  return open ? rect : null;
}

function pageAction(model: CallRoomModel, page: CallPage): CallMenuAction {
  return {
    onPress: (): void => {
      model.layers.open(page);
    },
    subpage: (navigation) => <CallPageSheet model={model} page={page} navigation={navigation} />,
  };
}

export function CallLayers({ model }: { readonly model: CallRoomModel }): ReactNode {
  const camera = useMenuRect(model, 'camera');
  const share = useMenuRect(model, 'share');
  const { layer, close } = model.layers;
  const home = pageAction(model, HOME_PICKER);
  const screen =
    model.screenSharePage === null
      ? { onPress: model.shareScreen }
      : pageAction(model, model.screenSharePage);
  return (
    <>
      <CallMenu
        open={camera !== null}
        rect={camera}
        label="Camera options"
        items={cameraMenuOf(model.call, callEngine.capabilities(), {
          onFacing: chooseFacing,
          onPause: pauseCamera,
          onLight: setCameraLight,
          home,
          onStop: stopCamera,
        })}
        onClose={close}
      />
      <CallMenu
        open={share !== null}
        rect={share}
        label="Share options"
        items={shareMenuOf(model.call, appPlatform(), model.captureMode === 'picker', {
          screen,
          window: pageAction(model, WINDOW_PICKER),
          home,
          onStop: stopSharing,
        })}
        onClose={close}
      />
      {layer?.kind === 'picker' || layer?.kind === 'explainer' ? (
        <CallPageSheet model={model} page={layer} />
      ) : null}
    </>
  );
}
