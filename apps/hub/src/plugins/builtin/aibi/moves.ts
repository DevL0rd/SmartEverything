import type { RobotMoves } from '@smarteverything/domain';
import { describeRule, enabledActions, enabledAnimations, type Abilities } from './catalogue';

const CHOICE_RULE = 'one of the choices';

export function movesOf(abilities: Abilities): RobotMoves {
  return {
    actions: enabledActions(abilities).map((action) => ({
      id: action.id,
      description: action.description,
      instructions: action.instructions,
      options: Object.entries(action.params).map(([name, rule]) => ({
        name,
        choices: Array.isArray(rule) ? rule.map(String) : [],
        rule: Array.isArray(rule) ? CHOICE_RULE : describeRule(rule),
      })),
    })),
    animations: enabledAnimations(abilities).length,
  };
}
