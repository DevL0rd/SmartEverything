import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { WIDE_VISUAL_PX, WideCard, type WideClass } from '../card/wide-card';
import { actionsOf } from './remote-actions';
import { RemoteGraph } from './remote-graph';
import type { RemoteSource } from './remote-source';
import { RemoteVisual } from './remote-visual';
import { useRemoteView, type RemoteView } from './use-remote-view';

const GRAPH_PX: Readonly<Record<WideClass, number>> = { m: 16, w: 28, l: 48, xl: 48 };
const NO_BUTTONS = 'No buttons yet.';

export function LearnButton({ source }: { readonly source: RemoteSource }): ReactNode {
  return source.blaster === null ? (
    <ReasonLine text={NO_BUTTONS} />
  ) : (
    <Button
      label="Learn a button"
      icon="plus"
      variant="tonal"
      href={href.settings.device(source.blaster.id, 'remotes')}
    />
  );
}

function reasonOf(source: RemoteSource, view: RemoteView): string | null {
  if (view.blocked !== null) {
    return view.blocked;
  }
  return view.empty && source.blaster === null ? NO_BUTTONS : null;
}

function actionsFor(source: RemoteSource, view: RemoteView): readonly ReactNode[] {
  if (reasonOf(source, view) !== null) {
    return [];
  }
  if (view.empty) {
    return [<LearnButton key="learn" source={source} />];
  }
  return actionsOf({
    controls: view.controls,
    assumed: view.assumed,
    on: view.on,
    press: view.press,
  });
}

function Notes({
  source,
  view,
}: {
  readonly source: RemoteSource;
  readonly view: RemoteView;
}): ReactNode {
  const reason = reasonOf(source, view);
  if (reason === null && view.failure === null) {
    return null;
  }
  return (
    <View className="min-w-0 gap-0.5">
      {view.failure === null ? null : (
        <Text variant="caption" tone={view.failure.tone} numberOfLines={2} align="end">
          {view.failure.text}
        </Text>
      )}
      {reason === null ? null : <ReasonLine text={reason} />}
    </View>
  );
}

export function RemoteFace({
  source,
  cls,
}: {
  readonly source: RemoteSource;
  readonly cls: WideClass;
}): ReactNode {
  const view = useRemoteView(source);
  return (
    <WideCard
      cls={cls}
      summary={`${source.name}. ${view.chip.label}. ${view.line.text}`}
      visual={<RemoteVisual source={source} px={WIDE_VISUAL_PX[cls]} look={view.look} />}
      title={source.name}
      titleLines={2}
      chip={<Badge label={view.chip.label} tone={view.chip.tone} />}
      state={
        <Text variant="footnote" tone={view.line.tone} numberOfLines={1}>
          {view.line.text}
        </Text>
      }
      graph={
        <RemoteGraph
          category={source.category}
          assumed={view.assumed}
          blaster={source.blaster}
          height={GRAPH_PX[cls]}
        />
      }
      actions={actionsFor(source, view)}
      ticker={<Notes source={source} view={view} />}
    />
  );
}
