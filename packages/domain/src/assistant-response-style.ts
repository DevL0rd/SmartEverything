import { z } from 'zod';

export const CUSTOM_PERSONALITY_MAX = 2000;
export const RESPONSE_PERSONALITIES = [
  {
    value: 'default',
    label: 'Default',
    description: 'Warm, witty and playful.',
    guidance:
      'Warm, witty and playful: friendly and quick, with real humour, glad to joke, banter and play along.',
  },
  {
    value: 'warm',
    label: 'Warm',
    description: 'Friendly, patient and encouraging.',
    guidance: 'Warm: friendly, patient and encouraging.',
  },
  {
    value: 'direct',
    label: 'Direct',
    description: 'Straightforward and matter-of-fact.',
    guidance: 'Direct: straightforward and matter-of-fact.',
  },
  {
    value: 'playful',
    label: 'Playful',
    description: 'Lighthearted, with plenty of wit.',
    guidance: 'Playful: lighthearted and witty, always up for jokes, banter and games.',
  },
  {
    value: 'wry',
    label: 'Wry',
    description: 'Dry humor with a gentle touch.',
    guidance: 'Wry: dry, deadpan humour with a gentle touch, teasing but never mocking the person.',
  },
  { value: 'custom', label: 'Custom', description: 'Describe your own tone.', guidance: '' },
] as const;
export const RESPONSE_VERBOSITIES = [
  {
    value: 'brief',
    label: 'Brief',
    guidance: 'Keep explanations brief while retaining necessary facts and results.',
  },
  { value: 'balanced', label: 'Balanced', guidance: '' },
  {
    value: 'detailed',
    label: 'Detailed',
    guidance:
      'Give detailed explanations with useful context and examples when the task benefits from them.',
  },
] as const;
export const RESPONSE_FORMATS = [
  { value: 'adaptive', label: 'Adaptive', guidance: '' },
  {
    value: 'paragraphs',
    label: 'Paragraphs',
    guidance: 'Prefer connected paragraphs when they communicate the answer clearly.',
  },
  {
    value: 'lists',
    label: 'Lists',
    guidance: 'Prefer lists when they communicate the answer clearly.',
  },
] as const;
export const RESPONSE_PERSONALITY = z.enum(RESPONSE_PERSONALITIES.map((row) => row.value));
export const RESPONSE_VERBOSITY = z.enum(RESPONSE_VERBOSITIES.map((row) => row.value));
export const RESPONSE_FORMAT = z.enum(RESPONSE_FORMATS.map((row) => row.value));
const RESPONSE_STYLE_SHAPE = {
  personality: RESPONSE_PERSONALITY,
  verbosity: RESPONSE_VERBOSITY,
  format: RESPONSE_FORMAT,
  custom_personality: z.string().max(CUSTOM_PERSONALITY_MAX),
};
export const ASSISTANT_RESPONSE_STYLE_WRITE = z.strictObject({
  personality: RESPONSE_STYLE_SHAPE.personality.default('default'),
  verbosity: RESPONSE_STYLE_SHAPE.verbosity.default('balanced'),
  format: RESPONSE_STYLE_SHAPE.format.default('adaptive'),
  custom_personality: RESPONSE_STYLE_SHAPE.custom_personality.default(''),
});
export const ASSISTANT_RESPONSE_STYLE_CHANGE = z.strictObject(RESPONSE_STYLE_SHAPE).partial();
export const ASSISTANT_RESPONSE_STYLE = ASSISTANT_RESPONSE_STYLE_WRITE.strip();
export type AssistantResponseStyle = z.output<typeof ASSISTANT_RESPONSE_STYLE>;
export const DEFAULT_RESPONSE_STYLE = ASSISTANT_RESPONSE_STYLE.parse({});

export function personalityGuidance(style: AssistantResponseStyle): string {
  const custom = style.personality === 'custom' ? style.custom_personality.trim() : '';
  if (custom !== '') return custom;
  const preset = RESPONSE_PERSONALITIES.find(
    (entry) => entry.value === style.personality && entry.guidance !== '',
  );
  return (preset ?? RESPONSE_PERSONALITIES[0]).guidance;
}

export function responseStyleGuidance(style: AssistantResponseStyle): string {
  const guidance = [
    RESPONSE_VERBOSITIES.find((row) => row.value === style.verbosity)?.guidance,
    RESPONSE_FORMATS.find((row) => row.value === style.format)?.guidance,
  ].filter((part) => part !== '' && part !== undefined);
  return guidance.length === 0
    ? ''
    : [
        'Presentation preferences (explicit user and owner instructions take precedence). Preserve useful code, tables, diagrams and task-specific structure.',
        ...guidance,
      ].join('\n');
}
