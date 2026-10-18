import { describe, expect, it } from 'vitest';
import { sameWords, silenceHallucination, speechOf } from '../../src/transcripts/heard-text';

describe('speechOf', () => {
  it.each(['-', '.', '- -', '*laughs*', '*crickets*', '[Music]', '♪ ♪', '(sighs)'])(
    'drops non-speech %j',
    (text) => {
      expect(speechOf(text)).toBeNull();
    },
  );

  it.each([
    'Subtitles by the Amara.org community',
    'hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn',
    'MBC 뉴스 김성현입니다.',
    'Продолжение следует...',
  ])('drops a subtitle credit %j', (text) => {
    expect(speechOf(text)).toBeNull();
  });

  it('keeps real speech and strips sound tags inside it', () => {
    expect(speechOf('*laughs* Okay, turn the lights off.')).toBe('Okay, turn the lights off.');
    expect(speechOf('Thank you.')).toBe('Thank you.');
  });
});

describe('silenceHallucination', () => {
  it.each([
    'Thank you.',
    '- Thank you.',
    'Thank you.  Thank you.',
    'Obrigado.',
    'Спасибо.',
    'you',
    'Bye.',
  ])('flags the whole-line silence phrase %j', (text) => {
    expect(silenceHallucination(text)).toBe(true);
  });

  it.each(['Thank you very much, that was great.', 'Okay.', 'Yeah.', 'What do you think?'])(
    'keeps %j',
    (text) => {
      expect(silenceHallucination(text)).toBe(false);
    },
  );
});

describe('sameWords', () => {
  it('ignores case and punctuation', () => {
    expect(sameWords('Yeah.', '- yeah')).toBe(true);
    expect(sameWords('Yeah.', 'Okay.')).toBe(false);
  });
});
