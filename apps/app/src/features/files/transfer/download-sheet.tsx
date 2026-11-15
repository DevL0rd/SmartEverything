import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { isNative } from '../../../design/platform';
import type { DownloadFlow } from './download-flow';
import { downloadSheetOf, type DownloadSheetView } from './download-sheet-model';

type Ready = Extract<DownloadSheetView, { readonly kind: 'ready' }>;

function Skipped({ view }: { readonly view: Ready }): ReactNode {
  if (view.skippedTitle === null) return null;
  return (
    <View className="gap-1">
      <ReasonLine icon="warning" tone="warning" text={view.skippedTitle} />
      {view.skipped.map((line) => (
        <Text key={line} variant="caption" tone="variant" selectable>
          {line}
        </Text>
      ))}
      <Text variant="caption" tone="variant">
        The zip lists them in “Not included.txt”.
      </Text>
    </View>
  );
}

function Working({ flow, view }: { readonly flow: DownloadFlow; readonly view: Ready }): ReactNode {
  if (view.working === null) return null;
  return (
    <View className="gap-2">
      <ProgressBar progress={null} colour="primary" label={view.working} />
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" tone="variant" className="min-w-0 shrink">
          {view.working}
        </Text>
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

function Intents({ flow, view }: { readonly flow: DownloadFlow; readonly view: Ready }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {view.intents.map((spec) => (
        <Button
          key={spec.intent}
          label={spec.label}
          icon={spec.icon}
          variant={spec.primary ? 'filled' : 'tonal'}
          disabled={view.busy}
          onPress={() => {
            background(flow.run(spec.intent), 'files.download_failed');
          }}
        />
      ))}
    </View>
  );
}

function ReadyBody({
  flow,
  view,
}: {
  readonly flow: DownloadFlow;
  readonly view: Ready;
}): ReactNode {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="body-strong" numberOfLines={2}>
          {view.name}
        </Text>
        <Text variant="footnote" tone="variant">
          {view.facts}
        </Text>
      </View>
      <Skipped view={view} />
      {view.done === null ? null : (
        <ReasonLine icon="circleCheck" tone="positive" text={view.done} />
      )}
      <Working flow={flow} view={view} />
      <Intents flow={flow} view={view} />
    </View>
  );
}

function Body({
  flow,
  view,
}: {
  readonly flow: DownloadFlow;
  readonly view: DownloadSheetView;
}): ReactNode {
  switch (view.kind) {
    case 'closed':
      return null;
    case 'preparing':
      return (
        <View className="gap-2">
          <ProgressBar progress={null} colour="primary" label="Getting ready" />
          <Text variant="footnote" tone="variant">
            {view.line}
          </Text>
        </View>
      );
    case 'failed':
      return (
        <ErrorState
          error={view.error}
          retry={() => {
            flow.start(view.targets);
          }}
        />
      );
    case 'ready':
      return <ReadyBody flow={flow} view={view} />;
  }
}

export function DownloadSheet({
  flow,
  from,
}: {
  readonly flow: DownloadFlow;
  readonly from: string;
}): ReactNode {
  const view = downloadSheetOf(useValue(flow.state), isNative());
  return (
    <Sheet
      open={view.kind !== 'closed'}
      onClose={() => {
        flow.close();
      }}
      title={`Download from ${from}`}
      detents={['half', 'full']}
    >
      <View className="px-4 pb-6">
        <Body flow={flow} view={view} />
      </View>
    </Sheet>
  );
}
