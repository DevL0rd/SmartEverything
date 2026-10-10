import { FITNESS_GOAL_KEYS } from './fitness-settings';
import { NUTRITION_GOAL_KEYS } from './foods';

export interface SettingLinkTarget {
  readonly page: string;
  readonly fields: Readonly<Record<string, string>>;
}

const GOAL_ENTRIES: readonly (readonly [string, string])[] = [
  ...FITNESS_GOAL_KEYS.map((key) => [`fitness.goals.${key}`, `fitness-goal-${key}`] as const),
  ['fitness.maxHeartRate', 'health-max-heart-rate'],
  ...NUTRITION_GOAL_KEYS.map((key) => [`nutrition.${key}`, `nutrition-goal-${key}`] as const),
  ['nutrition.glassMl', 'nutrition-glass'],
];

const GOAL_FIELDS: Readonly<Record<string, string>> = Object.fromEntries(GOAL_ENTRIES);

export const SETTING_LINK_TOOLS: Readonly<Record<string, SettingLinkTarget>> = {
  update_assistant_settings: {
    page: 'assistant',
    fields: {
      name: 'assistant.name',
      instructions: 'assistant.instructions',
      default_engine: 'assistant.backend',
      activity_steps: 'assistant.steps',
    },
  },
  set_ai_budget: { page: 'assistant/budget', fields: {} },
  update_mcp_tools: { page: 'assistant/integrations/tools', fields: {} },
  set_goals: { page: 'health/goals', fields: GOAL_FIELDS },
  update_home: { page: 'home', fields: {} },
  set_home_location_by_name: { page: 'home/location', fields: {} },
  update_profile: { page: 'profiles', fields: {} },
  update_talk_channel: { page: 'talk/channels', fields: {} },
  update_plugin: { page: 'plugins', fields: {} },
  set_preference: { page: 'appearance', fields: {} },
};

export const LINK_ARGUMENT_SKIPPED: ReadonlySet<string> = new Set(['confirm', 'profileId']);
