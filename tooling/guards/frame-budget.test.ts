import { RuleTester, localRule } from './lint-rule-tester';

const LOOP =
  'const read = () => { level.set(read1()); frame = requestAnimationFrame(read); }; frame = requestAnimationFrame(read);';

const LOOP_DECLARED =
  'function step() { draw(); requestAnimationFrame(step); } requestAnimationFrame(step);';

const BOUNDED =
  'let frame = requestAnimationFrame(function step(now) { draw(now); if (now < end) { frame = requestAnimationFrame(step); } });';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'frame-budget',
  await localRule('frame-budget'),
  {
    valid: [
      { code: 'const sorted = [...items].sort(byName);' },
      { code: 'const copy = items.slice().reverse();' },
      { code: 'schema.with(1);' },
      { code: 'const SECOND = 1000; setInterval(tick, SECOND);' },
      { code: 'setInterval(tick, 250);' },
      { code: 'setInterval(tick, delayFromProps);' },
      { code: 'let delay = 16; setInterval(tick, delay);' },
      { code: BOUNDED },
      { code: 'requestAnimationFrame(() => { setReady(true); });' },
      { code: 'const run = () => { now < end ? requestAnimationFrame(run) : done(); };' },
    ],
    invalid: [
      { code: 'const sorted = items.toSorted(byName);', errors: [{ messageId: 'hermes' }] },
      { code: 'const back = items.toReversed();', errors: [{ messageId: 'hermes' }] },
      { code: 'const fewer = items.toSpliced(1, 1);', errors: [{ messageId: 'hermes' }] },
      { code: 'const swapped = items.with(0, first);', errors: [{ messageId: 'hermes' }] },
      { code: 'setInterval(tick, 16);', errors: [{ messageId: 'interval' }] },
      {
        code: 'const STEP_MS = 100; setInterval(tick, STEP_MS);',
        errors: [{ messageId: 'interval' }],
      },
      { code: LOOP, errors: [{ messageId: 'frameLoop' }] },
      { code: LOOP_DECLARED, errors: [{ messageId: 'frameLoop' }] },
    ],
  },
);
