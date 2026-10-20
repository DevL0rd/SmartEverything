import { HEAD_DUE_PERCENT, HEAD_WARN_PERCENT, type BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Device } from '../../../store/state';
import { BrushVisual } from '../components/brush-visual';
import { daysLeftRatio, headLine, wearTone, type WearTone } from '../model/care-model';
import type { ColourRole } from '../../../design/tokens';
import { batteryWord, bodyHeightOf, liveFaceOf, visualPxOf } from '../model/widget-model';

const WEAR_COLOUR: Readonly<Record<WearTone, ColourRole>> = {
  fresh: 'positive',
  worn: 'warning',
  due: 'critical',
};

function wornPercent(view: BrushStateView): number | null {
  const ratio = daysLeftRatio(view.head);
  return ratio === null ? view.head.wearPercent : (1 - ratio) * 100;
}

function leftText(view: BrushStateView): string | null {
  const { head } = view;
  if (head.daysLeft !== null) {
    return `${String(head.daysLeft)} ${head.daysLeft === 1 ? 'day' : 'days'} left`;
  }
  return head.sessionsLeft === null ? null : `About ${String(head.sessionsLeft)} brushes left`;
}

function Wear({ view }: { readonly view: BrushStateView }): ReactNode {
  const percent = wornPercent(view);
  if (view.head.state !== 'fitted' || percent === null) {
    return null;
  }
  const tone = wearTone(percent, HEAD_WARN_PERCENT, HEAD_DUE_PERCENT);
  const left = leftText(view);
  return (
    <View className="gap-1">
      <ProgressBar
        progress={Math.min(1, percent / 100)}
        colour={WEAR_COLOUR[tone]}
        label={`Brush head ${String(Math.round(percent))} percent worn`}
      />
      {left === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {left}
        </Text>
      )}
    </View>
  );
}

export function HeadFace({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
}): ReactNode {
  const { frame, cls } = useWidgetFace();
  const px = visualPxOf(liveFaceOf(cls), bodyHeightOf(frame));
  if (view.profile.head === 'none') {
    return (
      <Text variant="callout" tone="variant">
        This model does not report its brush head.
      </Text>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <BrushVisual device={device} view={view} size="card" px={px} />
      <View className="min-w-0 flex-1 gap-2">
        {view.head.state === 'fitted' ? null : (
          <Badge label={headLine(view.head)} tone="warning" icon="warning" />
        )}
        <Wear view={view} />
        <Text variant="caption" tone="variant">
          Battery {batteryWord(view)}
        </Text>
      </View>
    </View>
  );
}
