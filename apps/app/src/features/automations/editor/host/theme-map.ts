import { NODE_CATEGORIES } from '@smarteverything/domain';
import { COLOUR_ROLES } from '../../../../design/colour-roles';
import {
  TYPE_COLOUR,
  categoryColour,
  colourVariable,
  type ValueType,
} from '../../../../design/node-colours';
import type { ColourRole } from '../../../../design/tokens';

export type ResolveColour = (role: ColourRole) => string;

export type CanvasTheme = Readonly<Record<string, string>>;

export const CATEGORY_VARIABLE_PREFIX = '--se-cat-';

export const TYPE_VARIABLE_PREFIX = '--se-type-';

export const PORT_TYPE_TOKENS: Readonly<Record<string, ValueType>> = {
  number: 'number',
  boolean: 'boolean',
  text: 'text',
  time: 'duration',
  list: 'list',
  record: 'record',
  reference: 'device',
  choice: 'choice',
  color: 'color',
  error: 'error',
  any: 'any',
};

export function buildCanvasTheme(resolve: ResolveColour): CanvasTheme {
  return Object.fromEntries([
    ...COLOUR_ROLES.map((role) => [colourVariable(role), resolve(role)] as const),
    ...Object.entries(PORT_TYPE_TOKENS).map(
      ([token, type]) => [`${TYPE_VARIABLE_PREFIX}${token}`, resolve(TYPE_COLOUR[type])] as const,
    ),
    ...NODE_CATEGORIES.map(
      ({ id, name }) =>
        [`${CATEGORY_VARIABLE_PREFIX}${id}`, resolve(categoryColour(name))] as const,
    ),
  ]);
}
