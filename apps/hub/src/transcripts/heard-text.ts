const SOUND_TAGS = /\*[^*]*\*|\[[^\]]*\]|\([^)]*\)|♪/gu;

const CREDITS = [
  'subtitles by the amara.org community',
  'hãy subscribe cho kênh ghiền mì gõ để không bỏ lỡ những video hấp dẫn',
  'cảm ơn các bạn đã theo dõi và hẹn gặp lại',
  'mbc 뉴스 김성현입니다',
  'ご視聴ありがとうございました',
  'продолжение следует',
];

const SILENCE_PHRASES = new Set([
  'thank you',
  'thank you thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'thank you so much for watching',
  'you',
  'bye',
  'bye bye',
  'obrigado',
  'obrigada',
  'gracias',
  'merci',
  'спасибо',
  'terima kasih',
  'tchau',
  'tchau tchau',
  'amen',
]);

function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const CREDIT_WORDS = new Set(CREDITS.map(wordsOf));

export function speechOf(text: string): string | null {
  const spoken = text.replace(SOUND_TAGS, ' ').replace(/\s+/gu, ' ').trim();
  const words = wordsOf(spoken);
  return words === '' || CREDIT_WORDS.has(words) ? null : spoken;
}

export function silenceHallucination(text: string): boolean {
  return SILENCE_PHRASES.has(wordsOf(text));
}

export function sameWords(left: string, right: string): boolean {
  return wordsOf(left) === wordsOf(right);
}
