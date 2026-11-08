import type { ReactNode } from 'react';
import type { MenuSubpageNavigation } from '../../../../components/menu';
import { appPlatform } from '../../../../design/platform';
import { useCameraEntries } from '../../../cameras';
import { startPick } from '../call-actions';
import { callEngine } from '../engine/engine';
import { sourceChoicesOf, type SourceChoice, type SourceScope } from '../model/call-sources';
import type { CallPage } from '../use-call-layers';
import type { CallRoomModel } from '../use-call-room';
import { ShareExplainer } from './share-explainer';
import { SourcePicker } from './source-picker';
import { useCaptureSources } from './use-capture-sources';

function pickerCopy(
  scope: SourceScope,
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

interface PageProps {
  readonly model: CallRoomModel;
  readonly page: CallPage;
  readonly navigation?: MenuSubpageNavigation | undefined;
}

function Picker({
  model,
  page: { scope, still },
  navigation,
}: PageProps & { readonly page: Extract<CallPage, { readonly kind: 'picker' }> }): ReactNode {
  const capture = useCaptureSources(true);
  const cameras = useCameraEntries();
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
  return (
    <SourcePicker
      {...pickerCopy(scope, still, model.name)}
      subpage={navigation === undefined ? undefined : { opener: navigation.opener }}
      choices={choices}
      empty={
        scope === 'home' ? 'No home cameras are set up yet.' : 'Nothing to share on this device.'
      }
      status={capture.status}
      problem={capture.status === 'failed' ? capture.reason : null}
      onPick={(choice: SourceChoice) => {
        const close = navigation?.close ?? model.layers.close;
        close();
        startPick(choice.pick, still);
      }}
      onClose={navigation?.back ?? model.layers.close}
    />
  );
}

export function CallPageSheet({ model, page, navigation }: PageProps): ReactNode {
  if (page.kind === 'picker') {
    return <Picker model={model} page={page} navigation={navigation} />;
  }
  return (
    <ShareExplainer
      subpage={navigation === undefined ? undefined : { opener: navigation.opener }}
      name={model.name}
      onCancel={navigation?.back ?? model.layers.close}
      onStart={model.explainerStart}
    />
  );
}
