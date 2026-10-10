import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Rect } from '../../../../components/anchor';
import { useCameraEntries } from '../../../cameras';
import { appPlatform } from '../../../../design/platform';
import { callEngine } from '../engine/engine';
import { startPick } from '../call-actions';
import { sourceChoicesOf, type SourceChoice } from '../model/call-sources';
import type { CallRoomModel } from '../use-call-room';
import { CallMenu, measureMenuAnchor } from './call-menu';
import { ShareExplainer } from './share-explainer';
import { SourcePicker } from './source-picker';
import { useCaptureSources } from './use-capture-sources';

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

function pickerCopy(
  scope: 'all' | 'home' | 'screen' | 'window',
  still: boolean,
  name: string,
): { readonly title: string; readonly subtitle: string; readonly footnote: string | null } {
  if (still) {
    return {
      title: 'Show this',
      subtitle: 'One still picture, sent now. Nothing streams.',
      footnote: `Sends one still now. The indicator and a thumbnail in the call log show what ${name} looked at.`,
    };
  }
  const title =
    scope === 'home'
      ? 'Show a home camera'
      : scope === 'window'
        ? 'Share a window'
        : 'Share screen';
  return {
    title,
    subtitle: `Pick what to show ${name}. You can stop any time.`,
    footnote: null,
  };
}

function Picker({ model }: { readonly model: CallRoomModel }): ReactNode {
  const { layer } = model.layers;
  const open = layer?.kind === 'picker';
  const capture = useCaptureSources(open);
  const cameras = useCameraEntries();
  const scope = open ? layer.scope : 'all';
  const still = open && layer.still;
  const choices = sourceChoicesOf(
    {
      platform: appPlatform(),
      engine: callEngine.capabilities(),
      hub: model.call.capabilities,
      cameras,
      capture: capture.status === 'ready' ? capture.sources : [],
      captureMode: capture.status === 'ready' ? capture.mode : null,
    },
    scope,
  );
  const copy = pickerCopy(scope, still, model.name);
  return (
    <SourcePicker
      open={open}
      {...copy}
      choices={choices}
      empty={
        scope === 'home' ? 'No home cameras are set up yet.' : 'Nothing to share on this device.'
      }
      status={capture.status}
      problem={capture.status === 'failed' ? capture.reason : null}
      onPick={(choice: SourceChoice) => {
        model.layers.close();
        startPick(choice.pick, still);
      }}
      onClose={model.layers.close}
    />
  );
}

export function CallLayers({ model }: { readonly model: CallRoomModel }): ReactNode {
  const camera = useMenuRect(model, 'camera');
  const share = useMenuRect(model, 'share');
  return (
    <>
      <CallMenu
        open={camera !== null}
        rect={camera}
        anchor={model.cameraAnchor}
        label="Camera options"
        items={model.cameraMenu}
        onClose={model.layers.close}
      />
      <CallMenu
        open={share !== null}
        rect={share}
        anchor={model.shareAnchor}
        label="Share options"
        items={model.shareMenu}
        onClose={model.layers.close}
      />
      <ShareExplainer
        open={model.layers.layer?.kind === 'explainer'}
        name={model.name}
        onCancel={model.layers.close}
        onStart={model.explainerStart}
      />
      <Picker model={model} />
    </>
  );
}
