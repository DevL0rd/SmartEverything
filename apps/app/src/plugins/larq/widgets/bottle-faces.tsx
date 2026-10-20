import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { decimal } from '../../../format/number';
import { minutesOfDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { LevelChart } from '../charts/day-chart';
import { BottleFigure } from '../components/bottle-figure';
import { InsightChips } from '../components/insight-chips';
import { StateChip } from '../components/state-chip';
import { TodayRing } from '../components/today-ring';
import { ageLine, batteryLine, lastDrinkLine } from '../model/bottle-model';
import { bodyHeightOf, faceKindOf } from '../model/widget-model';

interface FaceProps {
  readonly device: Device;
  readonly view: BottleStatusView;
}

const STRIP_PX = 72;
const PANEL_PX = 96;
const WIDE_PANEL_PX = 220;
const WIDE_FROM = 560;

function Level({ view }: { readonly view: BottleStatusView }): ReactNode {
  const { ml } = view.level;
  return ml === null ? (
    <Text variant="body-strong">Level unknown</Text>
  ) : (
    <Figure value={decimal(Math.round(ml))} unit="ml in the bottle" size="m" />
  );
}

function Summary({
  view,
  detail,
  fixed = false,
}: {
  readonly view: BottleStatusView;
  readonly detail: boolean;
  readonly fixed?: boolean;
}): ReactNode {
  const now = useMinute();
  return (
    <View className={fixed ? 'w-72 shrink-0 gap-1' : 'min-w-0 flex-1 gap-1'}>
      <Level view={view} />
      <Text variant="caption" tone="variant" numberOfLines={2}>
        {detail ? `${lastDrinkLine(view, now)} · ${batteryLine(view)}` : ageLine(view, now)}
      </Text>
      <View className="flex-row items-center gap-2">
        <StateChip view={view} />
        {detail ? (
          <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
            {ageLine(view, now)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function BottleFace({ device, view }: FaceProps): ReactNode {
  const { cls, frame } = useWidgetFace();
  const kind = faceKindOf(cls);
  const minute = minutesOfDay(useMinute());
  const body = bodyHeightOf(frame);
  const ringSize = Math.min(body, kind === 'panel' ? 168 : 88);
  const ring = <TodayRing today={view.today} minuteOfDay={minute} size={ringSize} label={false} />;
  if (kind === 'panel' && frame.width >= WIDE_FROM) {
    return (
      <View className="flex-1 flex-row items-center gap-6">
        <BottleFigure device={device} view={view} px={WIDE_PANEL_PX} trim />
        <View className="min-w-0 flex-1 gap-3">
          <Summary view={view} detail />
          <LevelChart today={view.today} body={view.body} nowMinute={minute} height={120} />
          <InsightChips view={view} skip={['best-day']} />
        </View>
        {ring}
      </View>
    );
  }
  if (kind === 'panel') {
    return (
      <View className="flex-1 gap-3">
        <View className="flex-row items-center gap-3">
          <BottleFigure device={device} view={view} px={PANEL_PX} trim />
          <Summary view={view} detail={false} />
          <TodayRing today={view.today} minuteOfDay={minute} size={PANEL_PX} label={false} />
        </View>
        <LevelChart
          today={view.today}
          body={view.body}
          nowMinute={minute}
          height={Math.max(72, body - PANEL_PX - 12)}
        />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <BottleFigure device={device} view={view} px={STRIP_PX} trim />
      <Summary view={view} detail={kind === 'row'} fixed={kind === 'row'} />
      {kind === 'row' ? (
        <View className="min-w-0 flex-1">
          <LevelChart today={view.today} body={view.body} nowMinute={minute} height={body} />
        </View>
      ) : null}
      {ring}
    </View>
  );
}
