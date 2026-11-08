import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SceneRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Figure, type FigureSize } from '../../../components/figure';
import { Icon, type IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, widgetBodyHeight } from '../../../components/widget-board';
import { useWidgetFace, type WidgetFace } from '../../../components/widget-board/use-widget-face';
import { TYPE_SCALE, type ColourRole } from '../../../design/tokens';
import { decimal, withUnit } from '../../../format/number';
import { plural, joinParts } from '../../../format/text';
import { DAY_MS, localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { useHome } from '../data/home-data';
import { consumersOf, sameConsumers } from '../model/consumers';
import type { FitnessFigure } from '../model/fitness-today';
import type { SecurityLine } from '../model/security';
import { activityRowCount, consumerRowCount, securityRowCount } from '../model/widget-fit';
import { ActivityLatest, ActivityRows } from './activity-rows';
import { ConsumerRows } from './energy-rows';
import { SceneChipGrid, SceneGlance, SceneScroller } from './scene-chips';
import { FitnessSetupWidget, useFitnessReady } from '../../profiles';

export function ActivityWidget(): ReactNode {
  const activity = useHome((view) => view.activity);
  const { frame, cls, sizes } = useWidgetFace();
  const tall = cls === 'l' || cls === 'xl';
  return (
    <WidgetFrame title="Activity" icon="activity" accent="info" href={href.activity()}>
      {cls === 's' ? (
        <ActivityLatest item={activity[0]} />
      ) : (
        <ActivityRows
          items={activity}
          count={activityRowCount(widgetBodyHeight(frame), frame.idiom, sizes, tall)}
          footer={tall}
        />
      )}
    </WidgetFrame>
  );
}

function SceneFace({ scenes }: { readonly scenes: readonly SceneRow[] }): ReactNode {
  const { frame, cls, sizes } = useWidgetFace();
  if (cls === 's') {
    return <SceneGlance scenes={scenes} />;
  }
  if (cls === 'l' || cls === 'xl') {
    return (
      <SceneChipGrid
        scenes={scenes}
        columns={cls === 'xl' ? 3 : 2}
        body={widgetBodyHeight(frame)}
        sizes={sizes}
      />
    );
  }
  return <SceneScroller scenes={scenes} />;
}

export function ScenesWidget(): ReactNode {
  const scenes = useHome((view) => view.scenes);
  return (
    <WidgetFrame title="Scenes" icon="sparkles" accent="primary" href={href.scenes()}>
      {scenes.length === 0 ? (
        <WidgetEmpty
          icon="sparkles"
          colour="primary"
          title="No scenes yet"
          body="Scenes you create show up here."
        />
      ) : (
        <SceneFace scenes={scenes} />
      )}
    </WidgetFrame>
  );
}

const CONSUMER_FIGURE_HEIGHT = 44;

export function EnergyWidget(): ReactNode {
  const power = useHome((view) => view.power);
  const consumers = useStoreSelector(consumersOf, sameConsumers);
  const { frame, cls } = useWidgetFace();
  if (power === null) {
    return null;
  }
  const small = cls === 's';
  const shown = small
    ? 0
    : consumerRowCount(
        widgetBodyHeight(frame),
        CONSUMER_FIGURE_HEIGHT,
        consumers.length > 1 ? consumers.length : 0,
      );
  return (
    <WidgetFrame title="Energy" icon="plug" accent="viz-2" glow="viz-2">
      <View className="gap-2">
        <View className="flex-row items-end justify-between gap-3">
          <Figure
            value={decimal(power.watts, 0)}
            size={small ? 'm' : 'l'}
            {...(power.unit === null ? {} : { unit: power.unit })}
          />
          {small ? null : (
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              Using now
            </Text>
          )}
        </View>
        {shown === 0 ? null : <ConsumerRows consumers={consumers.slice(0, shown)} />}
      </View>
    </WidgetFrame>
  );
}

function SecurityGlance({ security }: { readonly security: readonly SecurityLine[] }): ReactNode {
  const alerts = security.filter((line) => line.alert);
  const [first] = alerts;
  return (
    <View className="gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <Icon
          name={first === undefined ? 'circleCheck' : 'warning'}
          size={20}
          tone={first === undefined ? 'positive' : 'critical'}
        />
        <Text
          variant="callout"
          tone={first === undefined ? 'default' : 'critical'}
          numberOfLines={1}
          className="min-w-0 flex-1"
        >
          {first === undefined ? 'All closed' : plural(alerts.length, 'alert')}
        </Text>
      </View>
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {first === undefined
          ? `${plural(security.length, 'device')} watched`
          : joinParts([first.name, first.state])}
      </Text>
    </View>
  );
}

function SecurityLines({ security }: { readonly security: readonly SecurityLine[] }): ReactNode {
  const { frame } = useWidgetFace();
  const { shown, more } = securityRowCount(widgetBodyHeight(frame), security.length);
  return (
    <View className="flex-1 gap-2.5 overflow-hidden">
      {security.slice(0, shown).map((line) => (
        <View key={line.deviceId} className="flex-row items-center gap-3">
          <IconWell
            icon={line.alert ? 'warning' : 'shield'}
            colour={line.alert ? 'critical' : 'positive'}
            size="s"
          />
          <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
            {line.name}
          </Text>
          <Text variant="label" tone={line.alert ? 'critical' : 'positive'} numberOfLines={1}>
            {line.state}
          </Text>
        </View>
      ))}
      {more === 0 ? null : (
        <Text variant="footnote" tone="variant">
          {`+${String(more)} more`}
        </Text>
      )}
    </View>
  );
}

export function SecurityWidget(): ReactNode {
  const security = useHome((view) => view.security);
  const { cls } = useWidgetFace();
  const alert = security.some((line) => line.alert);
  return (
    <WidgetFrame
      title="Security"
      icon="shield"
      accent={alert ? 'critical' : 'positive'}
      glow={alert ? 'critical' : null}
    >
      {security.length === 0 ? (
        <WidgetEmpty
          icon="shield"
          colour="positive"
          title="Nothing to watch yet"
          body="Locks and sensors show up here."
        />
      ) : cls === 's' ? (
        <SecurityGlance security={security} />
      ) : (
        <SecurityLines security={security} />
      )}
    </WidgetFrame>
  );
}

function fitnessDayTitle(day: string, now: number, zone: string): string {
  if (day === localDayKey(new Date(now), zone)) {
    return 'Fitness today';
  }
  return day === localDayKey(new Date(now - DAY_MS), zone) ? 'Fitness yesterday' : 'Fitness';
}

const FALLBACK_LOOK: { icon: IconName; colour: ColourRole } = { icon: 'activity', colour: 'viz-1' };

const FIGURE_LOOK: Readonly<Record<string, { icon: IconName; colour: ColourRole }>> = {
  steps: { icon: 'footprints', colour: 'stand' },
  active_energy: { icon: 'flame', colour: 'move' },
  exercise: { icon: 'dumbbell', colour: 'exercise' },
  distance: { icon: 'route', colour: 'viz-1' },
};

const FITNESS_COLUMN_WIDTH = 152;

export type FitnessLayout = 'columns' | 'stacked' | 'compact';

const FITNESS_LAYOUT: Readonly<Record<FitnessLayout, string>> = {
  columns: 'flex-row gap-2',
  stacked: 'gap-1',
  compact: '',
};

const STACKED_GAP = 4;

export function fitnessLayout(
  face: Pick<WidgetFace, 'frame' | 'cls'>,
  count: number,
): FitnessLayout {
  const { frame, cls } = face;
  if (cls === 's') {
    return 'compact';
  }
  if (frame.width >= count * FITNESS_COLUMN_WIDTH) {
    return 'columns';
  }
  const row = TYPE_SCALE[frame.idiom]['figure-s'][1];
  const stacked = count * row + (count - 1) * STACKED_GAP;
  return stacked <= widgetBodyHeight(frame) ? 'stacked' : 'compact';
}

function FitnessFigureView({
  figure,
  layout,
  figureSize,
}: {
  readonly figure: FitnessFigure;
  readonly layout: FitnessLayout;
  readonly figureSize: FigureSize;
}): ReactNode {
  const look = FIGURE_LOOK[figure.key] ?? FALLBACK_LOOK;
  const label = (
    <Text variant="footnote" tone="variant" className="min-w-0 shrink">
      {figure.label}
    </Text>
  );
  const value =
    layout === 'compact' ? (
      <Text variant="callout" className="tabular">
        {withUnit(figure.value, figure.unit)}
      </Text>
    ) : (
      <Figure
        value={figure.value}
        size={figureSize}
        wrap
        {...(figure.unit === '' ? {} : { unit: figure.unit })}
      />
    );
  return layout !== 'columns' ? (
    <View className="flex-row items-center justify-between gap-2">
      <View className="min-w-0 shrink flex-row items-center gap-1.5">
        <Icon name={look.icon} size={16} colour={look.colour} />
        {label}
      </View>
      <View className="min-w-0 shrink">{value}</View>
    </View>
  ) : (
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <IconWell icon={look.icon} colour={look.colour} size="s" />
        {label}
      </View>
      {value}
    </View>
  );
}

export function FitnessTodayWidget(): ReactNode {
  const face = useWidgetFace();
  const fitness = useHome((view) => view.fitness);
  const zone = useSettings().time_zone;
  const now = useMinute();
  const ready = useFitnessReady();
  if (!ready) {
    return <FitnessSetupWidget title="Fitness" />;
  }
  if (fitness === null) {
    return null;
  }
  const day = fitnessDayTitle(fitness.day, now, zone);
  const layout = fitnessLayout(face, fitness.figures.length);
  const figureSize = layout === 'columns' && (face.cls === 'w' || face.cls === 'xl') ? 'm' : 's';
  return (
    <WidgetFrame title={day} icon="fitness" accent="move" href={href.fitness()}>
      <View className={FITNESS_LAYOUT[layout]}>
        {fitness.figures.map((figure) => (
          <FitnessFigureView
            key={figure.key}
            figure={figure}
            layout={layout}
            figureSize={figureSize}
          />
        ))}
      </View>
    </WidgetFrame>
  );
}
