import { BOTTLE_STATS, type BottleStats, type BottleStatsInput } from './bottle-stats-types';
import { bottleDayAfter, bottleDayIndex } from './bottle-days';
import {
  averageOver,
  barsOf,
  bestsOf,
  compare,
  firstDayOf,
  heatmapOf,
  lookupOf,
  sourcesOf,
  streakOf,
  windowsOf,
} from './bottle-stats-days';
import { dailyAveragesOf, dailyOf, rhythmOf, sizesOf } from './bottle-stats-drinks';

const WEEK_DAYS = 7;

const MONTH_DAYS = 30;

function drinksIn(
  input: BottleStatsInput,
  window: { readonly from: string; readonly to: string },
): { readonly count: number; readonly ml: number } {
  const inside = input.drinks.filter((drink) => drink.day >= window.from && drink.day <= window.to);
  return { count: inside.length, ml: inside.reduce((total, drink) => total + drink.ml, 0) };
}

function chipsOf(
  input: BottleStatsInput,
  lookup: ReturnType<typeof lookupOf>,
  windows: ReturnType<typeof windowsOf>,
): BottleStats['chips'] {
  const now = sourcesOf(lookup, windows.window, input.goalMl);
  const before = sourcesOf(lookup, windows.previous, input.goalMl);
  const length = bottleDayIndex(windows.window.to) - bottleDayIndex(windows.window.from) + 1;
  const thisDrinks = drinksIn(input, windows.window);
  const lastDrinks = drinksIn(input, windows.previous);
  return {
    total: compare(now.totalMl, before.totalMl),
    perDay: compare(now.totalMl / length, before.totalMl / length),
    drinks: compare(thisDrinks.count, lastDrinks.count),
    drinkSize: compare(
      thisDrinks.count === 0 ? 0 : thisDrinks.ml / thisDrinks.count,
      lastDrinks.count === 0 ? 0 : lastDrinks.ml / lastDrinks.count,
    ),
  };
}

export function bottleStatsOf(input: BottleStatsInput): BottleStats {
  const lookup = lookupOf(input.days);
  const windows = windowsOf(input.range, input.today);
  const first = firstDayOf(input.days, input.today);
  const daily = dailyOf(input.drinks, input.fills, input.today);
  const previousDaily = dailyOf(
    input.drinks,
    input.fills,
    bottleDayAfter(input.today, -MONTH_DAYS),
  );
  const sources = sourcesOf(lookup, windows.window, input.goalMl);
  return BOTTLE_STATS.parse({
    view: 'stats',
    range: input.range,
    today: input.today,
    window: windows.window,
    previousWindow: windows.previous,
    goalMl: input.goalMl,
    chips: chipsOf(input, lookup, windows),
    bars: barsOf(input, lookup, windows.window),
    averages: {
      sevenDayMl: averageOver(lookup, input.today, WEEK_DAYS, input.goalMl),
      thirtyDayMl: averageOver(lookup, input.today, MONTH_DAYS, input.goalMl),
    },
    heatmap: heatmapOf(lookup, input.today, input.goalMl),
    rhythm: rhythmOf(input.drinks, input.today),
    sizes: sizesOf(input.drinks, input.today),
    daily,
    dailyAverages: dailyAveragesOf(daily),
    previousDailyAverages: dailyAveragesOf(previousDaily),
    streak: streakOf(lookup, input.today, first),
    bests: bestsOf(lookup, input.today, first, input.goalMl),
    sources: { bottleMl: sources.bottleMl, loggedMl: sources.loggedMl, otherMl: sources.otherMl },
  });
}
