import { describe, expect, it } from 'vitest';
import { skipPatternProblemOf, withPattern, withoutPattern } from './skip-patterns';

const LIST = ['*.tmp', 'Films/Raw/**'] as const;

describe('skipPatternProblemOf', () => {
  it.each([
    '*.tmp.part',
    '.DS_Store',
    'Thumbs.db',
    '**/cache/**',
    'Films/[0-9]*/**',
    '*.{log,bak}',
  ])('accepts %s', (pattern) => {
    expect(skipPatternProblemOf(pattern, LIST)).toBeNull();
  });

  it('asks for a pattern when the field is blank', () => {
    expect(skipPatternProblemOf('   ', LIST)).toBe('Type a pattern');
  });

  it.each(['/mnt/media/cache', 'C:/Users/sam', 'c:Films'])(
    'refuses the absolute path %s',
    (pattern) => {
      expect(skipPatternProblemOf(pattern, LIST)).toBe(
        'Use a path inside the folder, without a leading slash or drive letter',
      );
    },
  );

  it('refuses backslashes', () => {
    expect(skipPatternProblemOf('Films\\Raw', LIST)).toBe('Use / between folders');
  });

  it('refuses a pattern that climbs out of the folder', () => {
    expect(skipPatternProblemOf('../other/**', LIST)).toBe(
      'A pattern cannot reach outside the folder',
    );
    expect(skipPatternProblemOf('Films/../../x', LIST)).toBe(
      'A pattern cannot reach outside the folder',
    );
  });

  it.each(['Films/[0-9*', '*.{log,bak', 'a]b[', '}{'])('refuses unbalanced %s', (pattern) => {
    expect(skipPatternProblemOf(pattern, LIST)).toBe('Close every bracket you open');
  });

  it('refuses a pattern already in the list after trimming', () => {
    expect(skipPatternProblemOf('  *.tmp ', LIST)).toBe('This pattern is already in the list');
  });
});

describe('pattern list edits', () => {
  it('adds the trimmed pattern at the end', () => {
    expect(withPattern(LIST, ' **/cache/** ')).toEqual(['*.tmp', 'Films/Raw/**', '**/cache/**']);
  });

  it('removes only the named pattern', () => {
    expect(withoutPattern(LIST, '*.tmp')).toEqual(['Films/Raw/**']);
  });
});
