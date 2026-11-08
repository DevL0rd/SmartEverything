export const MIN_WORDS = 4;

const GREETING = new Set([
  'hi',
  'hello',
  'hey',
  'yo',
  'hiya',
  'howdy',
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'goodnight',
  'bye',
  'goodbye',
  'see you',
  'see you later',
  'thanks',
  'thank you',
  'thanks a lot',
  'thank you so much',
  'thx',
  'ty',
  'cheers',
  'ok',
  'okay',
  'k',
  'kk',
  'yes',
  'no',
  'yep',
  'yeah',
  'yup',
  'nope',
  'nah',
  'sure',
  'fine',
  'cool',
  'great',
  'nice',
  'got it',
  'please',
  'stop',
  'cancel',
]);

const COMMAND_VERB =
  /^(turn|switch|set|play|pause|resume|stop|open|close|lock|unlock|dim|brighten|mute|unmute|start|skip|next|previous|volume|lower|raise|increase|decrease|toggle|run|cancel|remind|show|list|check|what's|whats)\b/iu;

const SELF = /\b(i|i'm|i've|i'll|i'd|my|me|we|our|us|mine)\b/iu;

const QUOTED = /["“”«»]/u;

function words(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word !== '');
}

function bare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasName(text: string): boolean {
  return words(text)
    .slice(1)
    .some((word) => /^[A-Z][a-z]+/u.test(word) && !/^I(['’]|$)/u.test(word));
}

export function trivial(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.startsWith('/')) return true;
  if (GREETING.has(bare(trimmed))) return true;
  const named = hasName(trimmed) || QUOTED.test(trimmed);
  if (named) return false;
  if (words(trimmed).length < MIN_WORDS) return true;
  return COMMAND_VERB.test(trimmed) && !SELF.test(trimmed);
}
