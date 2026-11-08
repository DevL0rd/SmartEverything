import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { NutritionPref } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Rings } from '../../../components/charts';
import { Button } from '../../../components/button';
import { Figure, type FigureSize } from '../../../components/figure';
import { Text } from '../../../components/text';
import {
  ActionBand,
  WidgetFrame,
  widgetBodyHeight,
  type WidgetSize,
} from '../../../components/widget-board';
import { isTile } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { CalorieDial } from '../components/calorie-dial';
import { GlassIcon } from '../components/glass-icon';
import { WaterGlass, type GlassSize } from '../components/water-glass';
import { GlassButton } from '../components/water-row';
import { useNutritionPrefs } from '../data/prefs';
import { useDayTotals, type DayTotals } from '../data/totals';
import { useWaterGoal } from '../data/water-goal';
import { NUTRIENT_MACROS, amountText, goalOf } from '../model/macros';
import { energyLayoutOf, energyWellOf, type EnergyLayout, type EnergyWell } from './energy-layout';
import { MacroColumns } from './macro-columns';
import { emptyLinesOf } from './nothing-logged';
import { Icon, type IconName } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { TYPE_SCALE, type ColourRole, type Idiom } from '../../../design/tokens';
import { decimal, litres } from '../../../format/number';
import { dayTitle } from '../../../format/time';

const GLASS_BUTTON_WIDTH = { touch: 168, pointer: 156 } as const;

const GLASS_SIZE: Readonly<Record<Idiom, GlassSize>> = { touch: 'l', pointer: 'm' };

export interface DayProps {
  readonly size: WidgetSize;
  readonly day: string;
  readonly today: string;
}

function page(day: string): ReturnType<typeof href.fitnessPage> {
  return href.fitnessPage('nutrition', { day });
}

interface EnergyFact {
  readonly key: 'eaten' | 'burned' | 'left';
  readonly label: string;
  readonly value: number;
}

const ENERGY_ICON: Readonly<Record<EnergyFact['key'], IconName>> = {
  eaten: 'utensils',
  burned: 'flame',
  left: 'trophy',
};

const ENERGY_ROLE: Readonly<Record<EnergyFact['key'], ColourRole>> = {
  eaten: 'viz-2',
  burned: 'move',
  left: 'positive',
};

const ENERGY_WELL: Readonly<Record<EnergyFact['key'], string>> = {
  eaten: 'bg-viz-2/16',
  burned: 'bg-move/16',
  left: 'bg-positive/16',
};

function energyFacts(
  eaten: number,
  burned: number | undefined,
  goal: number | null,
): readonly EnergyFact[] {
  const facts: EnergyFact[] = [{ key: 'eaten', label: 'Eaten', value: eaten }];
  if (burned !== undefined) {
    facts.push({ key: 'burned', label: 'Burned', value: burned });
  }
  if (goal !== null) {
    facts.push({
      key: 'left',
      label: eaten > goal ? 'Over goal' : 'Left',
      value: Math.abs(goal - eaten),
    });
  }
  return facts;
}

function EnergyRow({
  fact,
  well,
}: {
  readonly fact: EnergyFact;
  readonly well: EnergyWell | null;
}): ReactNode {
  const wide = well === null;
  return (
    <View
      className={
        wide ? 'min-w-0 flex-1 flex-row items-center gap-3' : 'flex-row items-center gap-2'
      }
    >
      <View
        className={cn(
          well ?? 'size-9',
          'items-center justify-center rounded-full',
          ENERGY_WELL[fact.key],
        )}
      >
        <Icon name={ENERGY_ICON[fact.key]} size={16} colour={ENERGY_ROLE[fact.key]} />
      </View>
      {wide ? (
        <View className="min-w-0 flex-1">
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {fact.label}
          </Text>
          <Figure value={amountText(fact.value, 'kcal')} unit="kcal" size="s" />
        </View>
      ) : (
        <>
          <Text variant="footnote" tone="variant" className="flex-1" numberOfLines={1}>
            {fact.label}
          </Text>
          <Text variant="callout" className="tabular" numberOfLines={1}>
            {`${amountText(fact.value, 'kcal')} kcal`}
          </Text>
        </>
      )}
    </View>
  );
}

function EnergyFacts({
  facts,
  layout,
}: {
  readonly facts: readonly EnergyFact[];
  readonly layout: Exclude<EnergyLayout, 'dial'>;
}): ReactNode {
  const { frame } = useWidgetFace();
  const strip = layout === 'strip';
  const well = strip ? null : energyWellOf(widgetBodyHeight(frame), facts.length, frame.idiom);
  return (
    <View className={cn('min-w-0 flex-1', strip ? 'flex-row gap-4' : 'gap-1')}>
      {facts.map((fact) => (
        <EnergyRow key={fact.key} fact={fact} well={well} />
      ))}
    </View>
  );
}

export function CaloriesWidget({ day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const prefs = useNutritionPrefs();
  const { cls } = useWidgetFace();
  const eaten = totals.energy_in ?? 0;
  const goal = prefs === null ? null : prefs.energyKcal;
  const layout = energyLayoutOf(cls);
  return (
    <WidgetFrame
      title={dayTitle('Calories', day, today)}
      icon="flame"
      accent="viz-2"
      href={page(day)}
    >
      <View className="flex-1 flex-row items-center gap-5">
        <CalorieDial eaten={totals.energy_in ?? null} goal={goal} size="xs" />
        {layout === 'dial' ? null : (
          <EnergyFacts facts={energyFacts(eaten, totals.total_energy, goal)} layout={layout} />
        )}
      </View>
    </WidgetFrame>
  );
}

function NothingLogged({ goal }: { readonly goal: number | null }): ReactNode {
  const { frame, sizes } = useWidgetFace();
  const lines = emptyLinesOf(widgetBodyHeight(frame) - sizes.controlH, frame.idiom);
  return (
    <View>
      <Text variant="body-strong" numberOfLines={1}>
        Nothing logged yet
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={lines}>
        {goal === null
          ? 'Log a meal to see protein, carbs and fat'
          : `Goal ${amountText(goal, 'kcal')} kcal today`}
      </Text>
    </View>
  );
}

function MacroBody({
  empty,
  tile,
  totals,
  prefs,
}: {
  readonly empty: boolean;
  readonly tile: boolean;
  readonly totals: DayTotals;
  readonly prefs: NutritionPref | null;
}): ReactNode {
  if (empty) {
    return <NothingLogged goal={prefs?.energyKcal ?? null} />;
  }
  if (tile) {
    const rings = NUTRIENT_MACROS.map((macro) => {
      const goal = prefs === null ? null : goalOf(prefs, macro);
      const value = totals[macro.metric] ?? 0;
      return {
        progress: goal === null ? (value > 0 ? 1 : 0) : value / goal,
        colour: macro.colour,
        label: macro.label,
      };
    });
    return (
      <View className="flex-1 items-center justify-center">
        <Rings rings={rings} size={96} />
      </View>
    );
  }
  return <MacroColumns totals={totals} prefs={prefs} />;
}

export function MacrosWidget({ day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const prefs = useNutritionPrefs();
  const empty = NUTRIENT_MACROS.every((macro) => (totals[macro.metric] ?? 0) === 0);
  const tile = isTile(useWidgetFace().cls);
  return (
    <WidgetFrame
      title={dayTitle('Macros', day, today)}
      icon="salad"
      accent="positive"
      href={page(day)}
      actions={
        empty ? (
          <Button label="Add food" icon="plus" variant="tonal" href={href.logFood({ day })} />
        ) : undefined
      }
    >
      <MacroBody empty={empty} tile={tile} totals={totals} prefs={prefs} />
    </WidgetFrame>
  );
}

function waterFigureOf(room: number, idiom: Idiom): FigureSize {
  return TYPE_SCALE[idiom]['figure-l'][1] <= room ? 'l' : 'm';
}

function AddGlass({
  labelled,
  day,
  today,
}: {
  readonly labelled: boolean;
  readonly day: string;
  readonly today: string;
}): ReactNode {
  return labelled ? <GlassButton day={day} today={today} /> : <GlassIcon day={day} today={today} />;
}

export function WaterWidget({ day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const goal = useWaterGoal();
  const drunk = (totals.hydration ?? 0) * 1000;
  const { cls, frame, sizes } = useWidgetFace();
  const tile = isTile(cls);
  const lane = useMeasuredWidth();
  const labelled = !tile && lane.width >= GLASS_BUTTON_WIDTH[frame.idiom];
  const figure = tile ? 'm' : waterFigureOf(widgetBodyHeight(frame) - sizes.controlH, frame.idiom);
  return (
    <WidgetFrame
      title={dayTitle('Water', day, today)}
      icon="glassWater"
      accent="humidity"
      href={page(day)}
    >
      <View className="flex-1 flex-row gap-4">
        <View className="shrink-0 self-start">
          <WaterGlass progress={drunk / goal.ml} size={tile ? 'm' : GLASS_SIZE[frame.idiom]} />
        </View>
        <View onLayout={lane.onLayout} className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-baseline gap-x-2">
            <Figure value={decimal(drunk / 1000, 2)} unit="L" size={figure} />
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {`of ${litres(goal.ml)}`}
            </Text>
          </View>
          <ActionBand>
            <AddGlass labelled={labelled} day={day} today={today} />
          </ActionBand>
        </View>
      </View>
    </WidgetFrame>
  );
}
