import { z } from 'zod';
import catalogueFile from './catalogue.json' with { type: 'json' };

const RULE = z.union([z.array(z.union([z.string(), z.number()])), z.string()]);

type Rule = z.output<typeof RULE>;

const CATALOGUE = z.object({
  actions: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().default(''),
      instructions: z.string().default(''),
      valid_params: z.record(z.string(), RULE).default({}),
    }),
  ),
  animations: z.array(z.string()),
});

export interface Action {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
  readonly params: Readonly<Record<string, Rule>>;
}

export type Params = Record<string, string | number>;

export interface Abilities {
  readonly actions: readonly string[];
  readonly animations: readonly string[];
}

export class RobotActionNotEnabledError extends Error {
  override readonly name = 'RobotActionNotEnabledError';

  constructor(readonly action: string) {
    super(`${action} is not an enabled AIBI action`);
  }
}

export class RobotActionParamError extends Error {
  override readonly name = 'RobotActionParamError';

  constructor(
    readonly action: string,
    readonly param: string,
    readonly received: unknown,
  ) {
    super(`${param}=${JSON.stringify(received)} is not valid for ${action}`);
  }
}

const RAW = CATALOGUE.parse(catalogueFile);

export const ACTIONS: readonly Action[] = [
  ...new Map(RAW.actions.map((row) => [row.id, row])).values(),
]
  .map((row) => ({
    id: row.id,
    description: row.description,
    instructions: row.instructions,
    params: row.valid_params,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

export const ANIMATIONS: readonly string[] = [...new Set(RAW.animations)].sort();

const RESERVED_ACTIONS: ReadonlySet<string> = new Set(['ability_chatgpt', 'interact_recognize']);

export const USABLE_ACTIONS: readonly string[] = ACTIONS.filter(
  (action) => !RESERVED_ACTIONS.has(action.id),
).map((action) => action.id);

export function enabledActions(abilities: Abilities): Action[] {
  const enabled = new Set(abilities.actions);
  return ACTIONS.filter((action) => enabled.has(action.id) && !RESERVED_ACTIONS.has(action.id));
}

export function enabledAnimations(abilities: Abilities): string[] {
  const chosen = new Set(abilities.animations);
  return ANIMATIONS.filter((name) => chosen.has(name));
}

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function allowed(rule: Rule, value: unknown, animationNames: ReadonlySet<string>): boolean {
  if (Array.isArray(rule)) {
    return rule.some((choice) => String(choice) === String(value));
  }
  if (rule === 'number') {
    return Number.isFinite(Number(value));
  }
  if (rule === 'number 1-12') {
    return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12;
  }
  if (rule === 'HH:mm') {
    return typeof value === 'string' && CLOCK_TIME.test(value);
  }
  return rule === 'string' && typeof value === 'string' && animationNames.has(value);
}

function typed(rule: Rule, value: unknown): string | number {
  if (Array.isArray(rule)) {
    return rule.find((choice) => String(choice) === String(value)) ?? String(value);
  }
  return rule.startsWith('number') ? Number(value) : String(value);
}

export function describeRule(rule: Rule): string {
  if (Array.isArray(rule)) {
    return rule.join('|');
  }
  return rule === 'string' ? 'animation name' : rule;
}

export function checkAction(
  abilities: Abilities,
  id: string,
  params: Readonly<Record<string, unknown>>,
): { readonly action: Action; readonly params: Params } {
  const action = enabledActions(abilities).find((item) => item.id === id);
  if (action === undefined) {
    throw new RobotActionNotEnabledError(id);
  }
  const animationNames = new Set(enabledAnimations(abilities));
  const result: Params = {};
  for (const [key, value] of Object.entries(params)) {
    const rule = action.params[key];
    if (rule === undefined || value === '' || value === undefined || value === null) {
      continue;
    }
    if (!allowed(rule, value, animationNames)) {
      throw new RobotActionParamError(id, key, value);
    }
    result[key] = typed(rule, value);
  }
  return { action, params: result };
}
