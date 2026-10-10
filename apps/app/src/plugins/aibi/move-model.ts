import type { JsonValue, RobotMove } from '@smarteverything/domain';

export type Given = Readonly<Record<string, string>>;

export function moveValue(move: RobotMove, given: Given): JsonValue {
  const options = Object.fromEntries(
    move.options.flatMap((option) => {
      const text = (given[option.name] ?? '').trim();
      return text === '' ? [] : [[option.name, text]];
    }),
  );
  return Object.keys(options).length === 0 ? { action: move.id } : { action: move.id, options };
}

export function optionHint(rule: string): string {
  return rule === 'one of the choices' ? '' : rule;
}

const QUICK_FIRST = [
  'ability_dance',
  'ability_sing',
  'ability_animal',
  'ability_dice',
  'behavior_sleep',
  'interact_game_rps',
];

export function quickMoves(moves: readonly RobotMove[], count: number): readonly RobotMove[] {
  const simple = moves.filter((move) => move.options.length === 0);
  const preferred = QUICK_FIRST.flatMap((id) => simple.filter((move) => move.id === id));
  const rest = simple.filter((move) => !QUICK_FIRST.includes(move.id));
  return [...preferred, ...rest].slice(0, count);
}
