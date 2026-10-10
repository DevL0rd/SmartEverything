import {
  HEALTH_METRICS,
  MCP_OPERATION_TOOLS,
  NUTRITION_WIDGET_OF,
  newChatWidgets,
  type ChatWidget,
  type HealthMetric,
  type NutritionWidgetPart,
} from '@smarteverything/domain';
import { z } from 'zod';
import { deviceIdsIn } from '../ai-tools/tool-lines';
import { partCallOf } from '../extensions/mcp/tools';
import {
  COVERAGE_RULES,
  FIRST_RULES,
  NO_WIDGET,
  pluginOfTool,
  pluginWidgets,
} from './coverage-rules';
import { LINK_RULES } from './link-rules';
import { dayOfCall, withDay } from './widget-day';
import type { RuleInput, WidgetFacts, WidgetRule } from './rule-input';

export type { WidgetFacts } from './rule-input';

const METRIC_KEYS: ReadonlySet<string> = new Set(['metric', 'metrics']);
const TYPE_KEYS: ReadonlySet<string> = new Set(['type', 'types']);
const METRICS_SHOWN = 3;
const OPERATION_CALL = z.looseObject({
  operation: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

function isMetric(value: string): value is HealthMetric {
  return HEALTH_METRICS.some((metric) => metric === value);
}

function wordsUnder(value: unknown, keys: ReadonlySet<string>, inside: boolean): string[] {
  if (typeof value === 'string') {
    return inside ? value.split(',').map((word) => word.trim()) : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => wordsUnder(entry, keys, inside));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => wordsUnder(entry, keys, keys.has(key)));
  }
  return [];
}

function metricsIn(args: RuleInput['args']): HealthMetric[] {
  return [...new Set(wordsUnder(args, METRIC_KEYS, false).filter(isMetric))];
}

function nutrition(part: NutritionWidgetPart): ChatWidget {
  return { kind: 'nutrition', part };
}

const FOOD: readonly ChatWidget[] = [nutrition('calories'), nutrition('macros')];

const RECORD_TYPE_METRIC: Readonly<Record<string, HealthMetric>> = {
  Hydration: 'hydration',
  Weight: 'weight',
  Steps: 'steps',
  SleepSession: 'sleep',
  ExerciseSession: 'exercise',
  Distance: 'distance',
  FloorsClimbed: 'floors',
  HeartRate: 'heart_rate_average',
  RestingHeartRate: 'resting_heart_rate',
  HeartRateVariabilityRmssd: 'heart_rate_variability',
  OxygenSaturation: 'oxygen_saturation',
  RespiratoryRate: 'respiratory_rate',
  Vo2Max: 'vo2_max',
  ActiveCaloriesBurned: 'active_energy',
  TotalCaloriesBurned: 'total_energy',
};

function metricWidget(metric: HealthMetric): ChatWidget {
  const part = NUTRITION_WIDGET_OF[metric];
  return part === undefined ? { kind: 'health', metric, range: 'week' } : nutrition(part);
}

function typeWidgets(args: RuleInput['args']): ChatWidget[] {
  return wordsUnder(args, TYPE_KEYS, false).flatMap((type) => {
    if (type === 'Nutrition') {
      return [...FOOD];
    }
    const metric = RECORD_TYPE_METRIC[type];
    return metric === undefined ? [] : [metricWidget(metric)];
  });
}

function distinctWidgets(widgets: readonly ChatWidget[]): ChatWidget[] {
  return widgets.reduce<ChatWidget[]>(
    (kept, widget) => [...kept, ...newChatWidgets(kept, [widget])],
    [],
  );
}

function healthWidgets({ args }: RuleInput): ChatWidget[] {
  return distinctWidgets([...metricsIn(args).map(metricWidget), ...typeWidgets(args)]).slice(
    0,
    METRICS_SHOWN,
  );
}

function entryWidgets(input: RuleInput): ChatWidget[] {
  const typed = healthWidgets(input);
  return typed.length === 0 ? [...FOOD] : typed;
}

function deviceWidgets({ args }: RuleInput, facts: WidgetFacts): ChatWidget[] {
  return deviceIdsIn(args).flatMap((id) => {
    const widget = facts.deviceWidget(id);
    return widget === null ? [] : [widget];
  });
}

function remoteWidgets({ args }: RuleInput, facts: WidgetFacts): ChatWidget[] {
  const named = args['remote'];
  const id = typeof named === 'string' ? facts.remoteId(named) : null;
  return id === null ? [] : [{ kind: 'remote', id }];
}

export const DEVICE_TOOLS_SKIPPED: ReadonlySet<string> = new Set([
  'list_devices',
  'search_everything',
  'list_rooms',
  'list_events',
  'get_history',
  'list_remotes',
]);

export const WIDGET_RULES: readonly WidgetRule[] = [
  ...FIRST_RULES,
  ...LINK_RULES,
  { tools: ['press_remote_button'], widgets: remoteWidgets },
  { tools: ['log_food'], widgets: () => [...FOOD] },
  { tools: ['list_health_entries'], widgets: entryWidgets },
  { tools: ['log_water'], widgets: () => [nutrition('hydration')] },
  {
    tools: [
      'get_health_latest',
      'get_health_summary',
      'read_health_daily',
      'read_health_records',
      'log_health',
      'update_health_entry',
      'delete_health_entry',
    ],
    widgets: healthWidgets,
  },
  {
    tools: ['get_weather', 'get_forecast', 'refresh_weather'],
    widgets: () => [{ kind: 'weather' }],
  },
  { tools: ['list_scenes'], widgets: () => [{ kind: 'scenes' }] },
  { tools: ['get_history'], widgets: deviceWidgets },
  ...COVERAGE_RULES,
];

function unwrapped(served: string, given: RuleInput): { name: string; input: RuleInput } {
  const part = partCallOf(served, given.args);
  const name = part.name;
  const input = { args: part.args, output: given.output };
  const call = name === 'call_operation' ? OPERATION_CALL.safeParse(input.args) : null;
  if (call?.success !== true) {
    return { name, input };
  }
  const tool = MCP_OPERATION_TOOLS.find(([, operation]) => operation === call.data.operation);
  return {
    name: tool === undefined ? call.data.operation : tool[0],
    input: { args: call.data.arguments, output: input.output },
  };
}

export function widgetsFor(called: string, given: RuleInput, facts: WidgetFacts): ChatWidget[] {
  const plugin = pluginOfTool(called);
  if (plugin !== null) {
    return pluginWidgets(plugin, facts);
  }
  const { name, input } = unwrapped(called, given);
  if (NO_WIDGET[name] !== undefined) {
    return [];
  }
  const rule = WIDGET_RULES.find((candidate) => candidate.tools.includes(name));
  if (rule !== undefined) {
    return withDay(rule.widgets(input, facts), dayOfCall(input.args));
  }
  return DEVICE_TOOLS_SKIPPED.has(name) ? [] : deviceWidgets(input, facts);
}
