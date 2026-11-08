import { describe, expect, it } from 'vitest';
import { SfvDictionaryError, stringDictionaryOf } from '../../src/app-updates/sfv-dictionary';

describe('reading a structured header dictionary of strings', () => {
  it('reads the members expo-updates writes, with the spacing it uses', () => {
    expect(stringDictionaryOf('channel="dev", key="abc.def-_"')).toStrictEqual({
      channel: 'dev',
      key: 'abc.def-_',
    });
    expect(stringDictionaryOf(' channel="release",key="x" ')).toStrictEqual({
      channel: 'release',
      key: 'x',
    });
  });

  it('unescapes quotes and backslashes and keeps the last of a repeated key', () => {
    expect(stringDictionaryOf('a="say \\"hi\\" \\\\", a="last"')).toStrictEqual({ a: 'last' });
    expect(stringDictionaryOf('a="say \\"hi\\" \\\\"')).toStrictEqual({ a: 'say "hi" \\' });
  });

  it('reads an empty header as no members', () => {
    expect(stringDictionaryOf('')).toStrictEqual({});
  });

  it.each([
    ['a bare token', 'channel=dev'],
    ['a trailing comma', 'channel="dev",'],
    ['a missing comma', 'channel="dev" key="x"'],
    ['an upper case key', 'Channel="dev"'],
    ['an unclosed string', 'channel="dev'],
    ['a parameter', 'channel="dev";q=1'],
    ['a non ASCII character', 'channel="dé"'],
  ])('refuses %s', (_name, header) => {
    expect(() => stringDictionaryOf(header)).toThrow(SfvDictionaryError);
  });
});
