import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-frame-measure',
  await localRule('no-frame-measure'),
  {
    valid: [
      { code: 'useAnimatedReaction(() => offset.get(), () => { place(measure(ref)); });' },
      {
        code: 'const frame = useFrameCallback((info) => { level.set(info.timeSincePreviousFrame); });',
      },
      {
        code: 'const callback = useFrameCallback(() => { const viewport = measure(scrollRef); scroll(viewport); }, false);',
        filename: '/repo/apps/app/src/components/widget-board/edit/drag-state.ts',
        options: [{ allow: ['apps/app/src/components/widget-board/edit/drag-state.ts'] }],
      },
    ],
    invalid: [
      {
        code: 'const frame = useFrameCallback(() => { const box = measure(ref); if (box !== null) place(box); }, false);',
        errors: [{ messageId: 'frameMeasure' }],
      },
      {
        code: 'const tick = () => { place(measure(ref)); }; useFrameCallback(tick);',
        errors: [{ messageId: 'frameMeasure' }],
      },
    ],
  },
);
