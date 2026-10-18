import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import type { DownloadFlow, DownloadIntent, DownloadState } from './download-flow';
import { sourceWord } from './file-model';
import { doneText, downloadFacts, skippedHeading, targetsTitle } from './download-text';

const SHOWN_SKIPPED = 5;

type Active = Exclude<DownloadState, { readonly kind: 'idle' | 'preparing' | 'failed' }>;

function Skipped({ state }: { readonly state: Active }): ReactNode {
  const { skipped } = state.prepared.download;
  if (skipped.length === 0) return null;
  const lines = skipped
    .slice(0, SHOWN_SKIPPED)
    .map((item) => `${item.path} — ${item.reason}`)
    .join('\n');
  const more =
    skipped.length > SHOWN_SKIPPED ? `\n…and ${String(skipped.length - SHOWN_SKIPPED)} more` : '';
  return (
    <View className="gap-1">
      <ReasonLine icon="warning" tone="warning" text={skippedHeading(skipped.length)} />
      <Text variant="caption" tone="variant" selectable>
        {`${lines}${more}\nThe zip lists them in “Not included.txt”.`}
      </Text>
    </View>
  );
}

function Actions({
  flow,
  busy,
}: {
  readonly flow: DownloadFlow;
  readonly busy: boolean;
}): ReactNode {
  const run = (intent: DownloadIntent) => (): void => {
    background(flow.run(intent), 'files.download_failed');
  };
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={isNative() ? 'Save to this phone' : 'Download'}
        icon="download"
        disabled={busy}
        onPress={run('save')}
      />
      {isNative() ? (
        <>
          <Button
            label="Open"
            icon="externalLink"
            variant="tonal"
            disabled={busy}
            onPress={run('open')}
          />
          <Button
            label="Share"
            icon="share"
            variant="tonal"
            disabled={busy}
            onPress={run('share')}
          />
        </>
      ) : null}
    </View>
  );
}

function Working({
  flow,
  state,
}: {
  readonly flow: DownloadFlow;
  readonly state: Active;
}): ReactNode {
  if (state.kind !== 'working') return null;
  const verb = state.intent === 'save' ? 'Saving' : 'Fetching';
  return (
    <View className="gap-2">
      <ProgressBar
        progress={null}
        colour="primary"
        label={`${verb} ${state.prepared.download.name}`}
      />
      <View className="flex-row items-center justify-between gap-2">
        <Text
          variant="footnote"
          tone="variant"
        >{`${verb} ${downloadFacts(state.prepared.download)}`}</Text>
        <Button
          label="Cancel"
          variant="text"
          onPress={() => {
            background(flow.cancel(), 'files.download_cancel_failed');
          }}
        />
      </View>
    </View>
  );
}

function Ready({
  flow,
  state,
}: {
  readonly flow: DownloadFlow;
  readonly state: Active;
}): ReactNode {
  const { download } = state.prepared;
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="body-strong" numberOfLines={2}>
          {download.name}
        </Text>
        <Text variant="footnote" tone="variant">
          {downloadFacts(download)}
        </Text>
      </View>
      <Skipped state={state} />
      {state.kind === 'done' ? (
        <ReasonLine
          icon="circleCheck"
          tone="positive"
          text={doneText(state.intent, state.outcome, sourceWord(isNative()))}
        />
      ) : null}
      <Working flow={flow} state={state} />
      <Actions flow={flow} busy={state.kind === 'working'} />
    </View>
  );
}

function Body({
  flow,
  state,
}: {
  readonly flow: DownloadFlow;
  readonly state: DownloadState;
}): ReactNode {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'preparing':
      return (
        <View className="gap-2">
          <ProgressBar progress={null} colour="primary" label="Getting ready" />
          <Text variant="footnote" tone="variant">
            {`Getting ${targetsTitle(state.targets)} ready…`}
          </Text>
        </View>
      );
    case 'failed':
      return (
        <ErrorState
          error={state.error}
          retry={() => {
            flow.start(state.targets);
          }}
        />
      );
    case 'ready':
    case 'working':
    case 'done':
      return <Ready flow={flow} state={state} />;
  }
}

export function DownloadSheet({
  flow,
  state,
  machine,
}: {
  readonly flow: DownloadFlow;
  readonly state: DownloadState;
  readonly machine: string;
}): ReactNode {
  return (
    <Sheet
      open={state.kind !== 'idle'}
      onClose={() => {
        flow.close();
      }}
      title={`Download from ${machine}`}
      detents={['half']}
    >
      <View className="px-4 pb-6">
        <Body flow={flow} state={state} />
      </View>
    </Sheet>
  );
}
