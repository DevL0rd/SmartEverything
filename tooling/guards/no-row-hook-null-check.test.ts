import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-row-hook-null-check',
  await localRule('no-row-hook-null-check'),
  {
    valid: [
      { code: 'const watch = useHasMyWatch();' },
      { code: 'const id = useMyWatchId();' },
      { code: 'const watch = useMyWatch(); const shown = watch !== null;' },
      { code: "const row = useRow('devices', id); const label = row?.label;" },
      { code: 'const has = useProfile() !== null;' },
    ],
    invalid: [
      { code: 'const watch = useMyWatch() !== null;', errors: [{ messageId: 'exists' }] },
      {
        code: 'const watch = useMyWatch() !== null && person === null;',
        errors: [{ messageId: 'exists' }],
      },
      { code: "const has = useRow('devices', id) !== null;", errors: [{ messageId: 'exists' }] },
      { code: 'const gone = null === useDevice(id);', errors: [{ messageId: 'exists' }] },
      { code: 'const gone = useDevice(id) == null;', errors: [{ messageId: 'exists' }] },
    ],
  },
);
