import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-component-interval',
  await localRule('no-component-interval'),
  {
    valid: [
      { code: 'const label = useSecondOf((now) => playTime(now - start), running);' },
      { code: 'const timer = setInterval(() => { send(); }, 500);' },
      { code: 'const fire = () => { repeat(); }; setInterval(fire, rate);' },
      { code: 'setTimeout(() => { setNow(Date.now()); }, 1000);' },
      {
        code: 'const sample = () => { setStats(read()); }; setInterval(sample, 1000);',
        filename: '/repo/apps/app/src/features/cameras/player/stream-info-sheet.tsx',
        options: [{ allow: ['apps/app/src/features/cameras/player/stream-info-sheet.tsx'] }],
      },
    ],
    invalid: [
      {
        code: 'useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); }, 1000); return () => clearInterval(timer); }, []);',
        errors: [{ messageId: 'componentInterval', data: { setter: 'setNow' } }],
      },
      {
        code: 'const sample = () => { if (ok) { setStats(read()); } }; const timer = setInterval(sample, 1000);',
        errors: [{ messageId: 'componentInterval', data: { setter: 'setStats' } }],
      },
      {
        code: 'function tick() { setCount((count) => count + 1); } globalThis.setInterval(tick, 1000);',
        errors: [{ messageId: 'componentInterval', data: { setter: 'setCount' } }],
      },
    ],
  },
);
