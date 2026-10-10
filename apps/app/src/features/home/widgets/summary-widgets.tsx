import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Sparkline } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Icon, type IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, heroFigure } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useHistory } from '../../../queries/history';
import { useSettings } from '../../../store/selectors';
import { ActivityRow } from '../../activity';
import { runSceneNow, sceneIcon } from '../../automations';
import { FitGrid } from '../components/fit-grid';
import { useHome } from '../data/home-data';
import type { FitnessFigure } from '../model/fitness-today';
import { FitnessSetupWidget, useFitnessReady } from '../../profiles';

export function ActivityWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const activity = useHome((view) => view.activity);
  const pointer = useIdiom() === 'pointer';
  return (
    <WidgetFrame title="Activity" icon="activity" accent="info" href={href.activity()} size={size}>
      <View className="relative flex-1">
        <View
          className={cn(
            'absolute bottom-6 top-6 w-px bg-outline-variant',
            pointer ? 'left-4' : 'left-5',
          )}
        />
        <FitGrid
          items={activity}
          keyOf={(item) => item.id}
          minItemWidth={240}
          maxColumns={1}
          renderItem={(item) => <ActivityRow item={item} time="moment" flush />}
        />
      </View>
    </WidgetFrame>
  );
}

export function ScenesWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const scenes = useHome((view) => view.scenes);
  return (
    <WidgetFrame title="Scenes" icon="sparkles" accent="primary" href={href.scenes()} size={size}>
      {scenes.length === 0 ? (
        <WidgetEmpty
          icon="sparkles"
          colour="primary"
          title="No scenes yet"
          body="Scenes you create show up here."
          size={size}
        />
      ) : (
        <View className="flex-1 flex-row flex-wrap content-start gap-2 overflow-hidden">
          {scenes.map((scene) => (
            <Interactive
              key={scene.id}
              label={`Run ${scene.name}`}
              onPress={() => {
                runSceneNow(scene);
              }}
              className="min-h-touch-min flex-row items-center gap-2 rounded-full bg-primary-container pl-3 pr-4"
              layerClassName="rounded-full"
            >
              <Icon name={sceneIcon(scene.icon)} size={20} tone="primary" />
              <Text variant="label" tone="primary" numberOfLines={1}>
                {scene.name}
              </Text>
            </Interactive>
          ))}
        </View>
      )}
    </WidgetFrame>
  );
}

function PowerTrend({ keys }: { readonly keys: readonly string[] }): ReactNode {
  const history = useHistory(keys, TREND_HOURS);
  const points = (history.data ?? []).flatMap((row) =>
    typeof row.value === 'number' ? [{ t: Date.parse(row.observed_at), v: row.value }] : [],
  );
  if (points.length < 2) {
    return null;
  }
  return <Sparkline points={points} colour="viz-2" height={40} area />;
}

const TREND_HOURS = 24;

export function EnergyWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const power = useHome((view) => view.power);
  if (power === null) {
    return null;
  }
  return (
    <WidgetFrame title="Energy" icon="plug" accent="viz-2" glow="viz-2" size={size}>
      <View className="flex-1 justify-end gap-2">
        <View className="flex-row items-end justify-between gap-3">
          <Figure
            value={decimal(power.watts, 0)}
            size={heroFigure(size)}
            {...(power.unit === null ? {} : { unit: power.unit })}
          />
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            Using now
          </Text>
        </View>
        {size === 'S' ? null : <PowerTrend keys={power.keys} />}
      </View>
    </WidgetFrame>
  );
}

export function SecurityWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const security = useHome((view) => view.security);
  const alert = security.some((line) => line.alert);
  return (
    <WidgetFrame
      title="Security"
      icon="shield"
      accent={alert ? 'critical' : 'positive'}
      glow={alert ? 'critical' : null}
      size={size}
    >
      {security.length === 0 ? (
        <WidgetEmpty
          icon="shield"
          colour="positive"
          title="Nothing to watch yet"
          body="Locks and sensors show up here."
          size={size}
        />
      ) : (
        <View className="flex-1 gap-2.5 overflow-hidden">
          {security.map((line) => (
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
        </View>
      )}
    </WidgetFrame>
  );
}

const DAY_MS = 86_400_000;

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

function FitnessFigureView({
  figure,
  big,
}: {
  readonly figure: FitnessFigure;
  readonly big: boolean;
}): ReactNode {
  const look = FIGURE_LOOK[figure.key] ?? FALLBACK_LOOK;
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <IconWell icon={look.icon} colour={look.colour} size={big ? 'm' : 's'} />
      <Figure
        value={figure.value}
        size={big ? 'l' : 'm'}
        {...(figure.unit === '' ? {} : { unit: figure.unit })}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {figure.label}
      </Text>
    </View>
  );
}

export function FitnessTodayWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const fitness = useHome((view) => view.fitness);
  const zone = useSettings().time_zone;
  const now = useMinute();
  const ready = useFitnessReady();
  if (!ready) {
    return <FitnessSetupWidget title="Fitness" size={size} />;
  }
  if (fitness === null) {
    return null;
  }
  const day = fitnessDayTitle(fitness.day, now, zone);
  return (
    <WidgetFrame
      title={size === 'S' ? 'Fitness' : day}
      icon="fitness"
      accent="move"
      href={href.fitness()}
      size={size}
    >
      <View className="flex-1 flex-row items-end gap-4">
        {fitness.figures.slice(0, size === 'S' ? 1 : 3).map((figure) => (
          <FitnessFigureView key={figure.key} figure={figure} big={size === 'S'} />
        ))}
      </View>
    </WidgetFrame>
  );
}
