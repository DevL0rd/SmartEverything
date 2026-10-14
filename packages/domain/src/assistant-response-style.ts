import { z } from 'zod';

export const CUSTOM_PERSONALITY_MAX = 2000;
export const RESPONSE_PERSONALITIES = [
  {
    value: 'default',
    label: 'Default',
    description: 'Clear, natural and adaptable.',
    guidance: '',
  },
  {
    value: 'warm',
    label: 'Warm',
    description: 'Friendly, patient and encouraging.',
    guidance: 'Use a friendly, patient and encouraging tone.',
  },
  {
    value: 'direct',
    label: 'Direct',
    description: 'Straightforward and matter-of-fact.',
    guidance: 'Use a straightforward, matter-of-fact tone.',
  },
  {
    value: 'playful',
    label: 'Playful',
    description: 'Lighthearted, with a little wit.',
    guidance: 'Use a lighthearted tone with a little wit when appropriate.',
  },
  {
    value: 'wry',
    label: 'Wry',
    description: 'Dry humor with a gentle touch.',
    guidance: 'Use gentle dry humor when appropriate, without mocking the person.',
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
export const ASSISTANT_RESPONSE_STYLE_WRITE = z.strictObject({
  personality: RESPONSE_PERSONALITY.default('default'),
  verbosity: RESPONSE_VERBOSITY.default('balanced'),
  format: RESPONSE_FORMAT.default('adaptive'),
  custom_personality: z.string().max(CUSTOM_PERSONALITY_MAX).default(''),
});
export const ASSISTANT_RESPONSE_STYLE = ASSISTANT_RESPONSE_STYLE_WRITE.strip();
export type AssistantResponseStyle = z.output<typeof ASSISTANT_RESPONSE_STYLE>;
export const DEFAULT_RESPONSE_STYLE = ASSISTANT_RESPONSE_STYLE.parse({});

export function responseStyleGuidance(style: AssistantResponseStyle): string {
  const tone =
    style.personality === 'custom'
      ? style.custom_personality
      : RESPONSE_PERSONALITIES.find((row) => row.value === style.personality)?.guidance;
  const guidance = [
    tone,
    RESPONSE_VERBOSITIES.find((row) => row.value === style.verbosity)?.guidance,
    RESPONSE_FORMATS.find((row) => row.value === style.format)?.guidance,
  ].filter((part) => part !== '' && part !== undefined);
  return guidance.length === 0
    ? ''
    : [
        'Response style preferences (tone and presentation only; explicit user and owner instructions take precedence). Preserve useful code, tables, diagrams and task-specific structure.',
        ...guidance,
      ].join('\n');
}
