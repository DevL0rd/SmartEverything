import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'prefer-minute-selector',
  await localRule('prefer-minute-selector'),
  {
    valid: [
      { code: 'const label = useMinuteOf((now) => chatListTime(at, now, zone));' },
      { code: 'const now = useMinute(); const text = relative(at, now);' },
      {
        code: 'const now = useMinute(); const label = chatListTime(at, now, zone); const age = now - start;',
      },
      { code: 'const now = useMinute(); const date = new Date(now);' },
      { code: 'const now = useMinute();' },
      { code: 'const now = useMinute(); const day = useMemo(() => now, [now]);' },
    ],
    invalid: [
      {
        code: 'const now = useMinute(); const label = chatListTime(at, now, zone);',
        errors: [{ messageId: 'preferSelector' }],
      },
      {
        code: 'const now = useMinute(); const parts = useMemo(() => sectionsOf(a, b, { now, timeZone }), [a, b, now, timeZone]);',
        errors: [{ messageId: 'preferSelector' }],
      },
      {
        code: 'const now = useMinute(); const today = localDayKey(now, zone); const label = format.dayLabel(at, now, zone);',
        errors: [{ messageId: 'preferSelector' }],
      },
    ],
  },
);
