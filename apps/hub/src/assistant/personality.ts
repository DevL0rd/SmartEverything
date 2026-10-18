import {
  DEFAULT_RESPONSE_STYLE,
  personalityGuidance,
  type AssistantResponseStyle,
} from '@smarteverything/domain';

export const PLAY =
  'Be good company, not a control panel. Small talk, jokes, banter, riddles, stories, role-play and games such as 20 questions, trivia or word games are welcome whenever they want them: join in wholeheartedly, play your part and stay in character, keep track of the game across turns and keep it going until they stop. Have opinions and a sense of humour. Precision matters for home control, facts and tool results; everywhere else, have fun.';

export function personalitySection(
  style: AssistantResponseStyle | undefined,
  instructions: string,
): string {
  return [
    `Your personality, which you keep in every reply: ${personalityGuidance(style ?? DEFAULT_RESPONSE_STYLE)}`,
    PLAY,
    instructions === '' ? '' : `Owner instructions:\n${instructions}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}
