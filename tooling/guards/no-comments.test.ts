import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-comments',
  await localRule('no-comments'),
  {
    valid: [
      { code: 'const a = 1;' },
      { code: "const text = '// not a comment';" },
      { code: '/* eslint-disable no-console */\nconsole.log(1);' },
      { code: '// eslint-disable-next-line no-console\nconsole.log(1);' },
      { code: '/* global window */\nwindow.x = 1;' },
      { code: '/* globals a, b */\na(b);' },
      { code: '/* exported run */\nfunction run() {}' },
      { code: '// prettier-ignore\nconst  matrix = [1,0,0];' },
    ],
    invalid: [
      {
        code: '// explains the next line\nconst a = 1;',
        errors: [{ messageId: 'comment', line: 1 }],
      },
      { code: 'const a = 1; // trailing', errors: [{ messageId: 'comment', line: 1 }] },
      { code: '/* block */\nconst a = 1;', errors: [{ messageId: 'comment', line: 1 }] },
      {
        code: '/**\n * Documented.\n */\nfunction f() {}',
        errors: [{ messageId: 'comment', line: 1 }],
      },
      {
        code: '// eslintish prose that only starts like a directive\nconst a = 1;',
        errors: [{ messageId: 'comment', line: 1 }],
      },
      {
        code: '// first\n// second\nconst a = 1;',
        errors: [
          { messageId: 'comment', line: 1 },
          { messageId: 'comment', line: 2 },
        ],
      },
    ],
  },
);
