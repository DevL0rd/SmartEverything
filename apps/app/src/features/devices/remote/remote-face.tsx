import type { ReactNode } from 'react';
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

const GRAPH_HEIGHT = 28;
const PANEL_GRAPH_HEIGHT = 56;

export function LearnButton({ source }: { readonly source: RemoteSource }): ReactNode {
  return source.blaster === null ? (
    <ReasonLine text="No buttons yet." />
  ) : (
    <Button
      label="Learn a button"
      icon="plus"
      variant="tonal"
      href={href.settings.device(source.blaster.id, 'remotes')}
    />
  );
}

function actionsFor(source: RemoteSource, view: RemoteView, cls: WideClass): readonly ReactNode[] {
  if (view.blocked !== null) {
    return [<ReasonLine key="why" text={view.blocked} />];
  }
  if (view.empty) {
    return [<LearnButton key="learn" source={source} />];
  }
  return actionsOf({
    controls: view.controls,
    assumed: view.assumed,
    on: view.on,
    press: view.press,
    cls,
  });
}

export function RemoteFace({
  source,
  cls,
}: {
  readonly source: RemoteSource;
  readonly cls: WideClass;
}): ReactNode {
  const view = useRemoteView(source);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      summary={`${source.name}. ${view.chip.label}. ${view.line.text}`}
      visual={<RemoteVisual source={source} px={WIDE_VISUAL_PX[cls]} look={view.look} />}
      title={source.name}
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
          height={panel ? PANEL_GRAPH_HEIGHT : GRAPH_HEIGHT}
        />
      }
      actions={actionsFor(source, view, cls)}
      ticker={
        view.failure === null ? undefined : (
          <Text variant="caption" tone={view.failure.tone} numberOfLines={1} align="end">
            {view.failure.text}
          </Text>
        )
      }
    />
  );
}
