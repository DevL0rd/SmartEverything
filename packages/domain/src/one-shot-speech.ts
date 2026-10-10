import { z } from 'zod';

export const SPEECH_PROVIDERS = ['gemini'] as const;

export type SpeechProvider = (typeof SPEECH_PROVIDERS)[number];

export const SPEECH_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;

export type SpeechModel = (typeof SPEECH_MODELS)[number];

export const CHEAPEST_SPEECH_MODEL: SpeechModel = 'gemini-3.8-flash-lite-tts';

export const SPEECH_MODEL_PROVIDERS: Readonly<Record<SpeechModel, SpeechProvider>> = {
  'gemini-3.8-flash-lite-tts': 'gemini',
  'gemini-3.8-flash-tts': 'gemini',
};

export const SPEECH_SAMPLE_RATE = 24_000;

export const SPEECH_FAILED = 'That could not be said.';

export const SPEECH_MODEL_LABELS: Readonly<Record<SpeechModel, string>> = {
  'gemini-3.8-flash-lite-tts': 'Cheapest: Gemini Flash-Lite TTS',
  'gemini-3.8-flash-tts': 'Fuller voice: Gemini Flash TTS',
};

export const SPEECH_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const;

export const SPEECH_VOICE = z.enum(SPEECH_VOICES);
