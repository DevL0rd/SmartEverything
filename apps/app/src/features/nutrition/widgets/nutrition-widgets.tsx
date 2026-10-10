import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Rings } from '../../../components/charts';
import { Button } from '../../../components/button';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import {
  WidgetFrame,
  boardClassOf,
  heroFigure,
  type WidgetSize,
} from '../../../components/widget-board';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { CalorieDial } from '../components/calorie-dial';
import { MacroList } from '../components/macro-list';
import { GlassIcon } from '../components/glass-icon';
import { WaterGlass } from '../components/water-glass';
import { GlassButton } from '../components/water-row';
import { useNutritionPrefs } from '../data/prefs';
import { useDayTotals } from '../data/totals';
import { useWaterGoal } from '../data/water-goal';
import { NUTRIENT_MACROS, amountText, goalOf } from '../model/macros';
import { Icon, type IconName } from '../../../components/icon';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { decimal, litres } from '../../../format/number';
import { dayTitle } from '../../../format/time';

const GLASS_BUTTON_ROOM = { touch: 168, pointer: 156 } as const;

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
  wide,
}: {
  readonly fact: EnergyFact;
  readonly wide: boolean;
}): ReactNode {
  return (
    <View
      className={
        wide ? 'min-w-0 flex-1 flex-row items-center gap-3' : 'flex-row items-center gap-2'
      }
    >
      <View
        className={cn(
          wide ? 'size-9' : 'size-7',
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

export function CaloriesWidget({ size, day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const prefs = useNutritionPrefs();
  const eaten = totals.energy_in ?? 0;
  const goal = prefs === null ? null : prefs.energyKcal;
  const board = boardClassOf(useSizeClass().width);
  const wide = size === 'W' && board !== 'compact';
  return (
    <WidgetFrame
      title={dayTitle('Calories', day, today)}
      icon="flame"
      accent="viz-2"
      href={page(day)}
      size={size}
    >
      <View className="flex-1 flex-row items-center gap-5">
        <CalorieDial eaten={totals.energy_in ?? null} goal={goal} size={wide ? 's' : 'xs'} />
        {size === 'S' ? null : (
          <View className={cn('min-w-0 flex-1', wide ? 'flex-row gap-4' : 'gap-2')}>
            {energyFacts(eaten, totals.total_energy, goal).map((fact) => (
              <EnergyRow key={fact.key} fact={fact} wide={wide} />
            ))}
          </View>
        )}
      </View>
    </WidgetFrame>
  );
}

function NothingLogged({
  day,
  goal,
  compact,
}: {
  readonly day: string;
  readonly goal: number | null;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className="flex-1 justify-center gap-3">
      <View className="gap-0.5">
        <Text variant="body-strong">Nothing logged yet</Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {goal === null
            ? 'Log a meal to see protein, carbs and fat'
            : `Goal ${amountText(goal, 'kcal')} kcal today`}
        </Text>
      </View>
      {compact ? null : (
        <View className="flex-row">
          <Button label="Add food" icon="plus" variant="tonal" href={href.logFood({ day })} />
        </View>
      )}
    </View>
  );
}

export function MacrosWidget({ size, day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const prefs = useNutritionPrefs();
  const rings = NUTRIENT_MACROS.map((macro) => {
    const goal = prefs === null ? null : goalOf(prefs, macro);
    const value = totals[macro.metric] ?? 0;
    return {
      progress: goal === null ? (value > 0 ? 1 : 0) : value / goal,
      colour: macro.colour,
      label: macro.label,
    };
  });
  const empty = NUTRIENT_MACROS.every((macro) => (totals[macro.metric] ?? 0) === 0);
  return (
    <WidgetFrame
      title={dayTitle('Macros', day, today)}
      icon="salad"
      accent="positive"
      href={page(day)}
      size={size}
    >
      {empty ? (
        <NothingLogged day={day} goal={prefs?.energyKcal ?? null} compact={size === 'S'} />
      ) : size === 'S' ? (
        <View className="flex-1 items-center justify-center">
          <Rings rings={rings} size={96} />
        </View>
      ) : (
        <View className="flex-1 justify-center">
          <MacroList totals={totals} prefs={prefs} compact />
        </View>
      )}
    </WidgetFrame>
  );
}

export function WaterWidget({ size, day, today }: DayProps): ReactNode {
  const totals = useDayTotals(day);
  const goal = useWaterGoal();
  const drunk = (totals.hydration ?? 0) * 1000;
  const idiom = useIdiom();
  const row = useMeasuredWidth();
  const readout = useMeasuredWidth();
  const labelled = size !== 'S' && row.width - readout.width >= GLASS_BUTTON_ROOM[idiom];
  return (
    <WidgetFrame
      title={dayTitle('Water', day, today)}
      icon="glassWater"
      accent="humidity"
      href={page(day)}
      size={size}
    >
      <View onLayout={row.onLayout} className="flex-1 flex-row items-end gap-3">
        <View className="min-w-0 flex-1 flex-row">
          <View onLayout={readout.onLayout} className="flex-row items-end gap-3">
            <WaterGlass progress={drunk / goal.ml} size={size === 'S' ? 'm' : 'l'} />
            <View>
              <Figure value={decimal(drunk / 1000, 2)} unit="L" size={heroFigure(size)} />
              <Text variant="footnote" tone="variant" numberOfLines={1}>
                {`of ${litres(goal.ml)}`}
              </Text>
            </View>
          </View>
        </View>
        {labelled ? <GlassButton day={day} today={today} /> : <GlassIcon day={day} today={today} />}
      </View>
    </WidgetFrame>
  );
}
