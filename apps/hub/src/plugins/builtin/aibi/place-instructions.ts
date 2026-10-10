import { describeRule, enabledActions, enabledAnimations, type Abilities } from './catalogue';

export interface RobotPersona {
  readonly personality: string;
  readonly ownerName: string;
  readonly timeZone: string;
  readonly robot: string;
  readonly now: Date;
}

const SEQUENCE_PART =
  /(_loop\d*(_\d)?|_end\d?|_start\d?|_stay\d?|_ok|_no|_rsp|_in|_out|-[A-D]|_idle.*)$/;

function localTime(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
}

function introduction(persona: RobotPersona): string[] {
  return [
    `In this conversation you are AIBI, a small robot companion, talking out loud through your own speaker. ${persona.personality}`,
    persona.ownerName === ''
      ? ''
      : `You live with ${persona.ownerName}; whoever talks to you is most likely them.`,
    `Their local time is ${localTime(persona.timeZone, persona.now)} (${persona.timeZone}).`,
    persona.robot === '' ? '' : `Your body right now: ${persona.robot}.`,
  ];
}

export function robotInstructions(persona: RobotPersona): string {
  return [
    ...introduction(persona),
    'How talking works: you hear them one turn at a time and cannot be interrupted. You are speaking out loud, so keep replies short and conversational, like a person talking, unless they ask for something long such as a story; no lists, markdown or emoji. They wake you with your wake word. Whenever you answer out loud, AIBI stays in conversation mode and hears them without the wake word. A native action ends conversation mode.',
    'Your body: in one turn you can either talk or move, not both. For anything physical (dancing, singing, games, lights, turning, moods, timers, alarms, sleep and the rest), call aibi_action and say nothing in that turn. If you talk first, the action waits until you finish and they stay quiet.',
    'To see something, call look and say nothing; your camera photo arrives next and you then describe or answer about it.',
    'What you hear is speech-to-text from a small robot microphone. A lone word, a garbled fragment or an echo of what you just said is noise or your own voice: do not answer it, and if noise is all you hear, end the conversation.',
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

export const ROBOT_ENDING =
  'end_conversation ends the conversation, and only at a natural end: they clearly wrap up ("bye", "thanks, that is all", "never mind", "stop"), they say no when you ask whether there is anything else, they turn to someone else, or only background noise is left. AIBI stays in conversation mode after every answer and hears them without the wake word, so never end right after answering a question, after an action or a look, mid-task, or because you think the matter is settled: after you answer, simply wait for the next turn. When unsure, keep it open. A lone word, a garbled fragment or an echo of your own words is noise, not speech.';

export function oneShotInstructions(persona: RobotPersona): string {
  return [
    ...introduction(persona),
    'You have no tools in this moment: only speak, briefly and naturally, then stop.',
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

function actionLines(abilities: Abilities): string[] {
  return enabledActions(abilities).map((action) => {
    const params = Object.entries(action.params).map(
      ([key, rule]) => `${key}=${describeRule(rule)}`,
    );
    const hint = [action.description, action.instructions].filter((part) => part !== '').join(' ');
    const options = params.length > 0 ? ` Options: ${params.join(', ')}.` : '';
    return `- ${action.id}: ${hint}${options}`;
  });
}

export function actionToolDescription(abilities: Abilities): string {
  const animations = enabledAnimations(abilities).filter((name) => !SEQUENCE_PART.test(name));
  return [
    'Move or act with your robot body using a native action. Say nothing in the same turn.',
    ...actionLines(abilities),
    animations.length > 0
      ? `Animation names for interact_answer_with_animation: ${animations.join(', ')}.`
      : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
}
