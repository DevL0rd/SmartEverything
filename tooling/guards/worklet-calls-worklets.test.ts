import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll } from 'vitest';
import { RuleTester, localRule } from './lint-rule-tester';

const rule = await localRule('worklet-calls-worklets');

const PLAIN = 'function plain() { return 1; }';

const WORKLET = "function marked() { 'worklet'; return 1; }";

const project = mkdtempSync(join(tmpdir(), 'worklet-rule-'));
const caseFile = join(project, 'case.ts');

for (const [name, text] of Object.entries({
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
    },
    include: ['*.ts'],
  }),
  'plain.ts': 'export function plain(): number { return 1; }\n',
  'marked.ts': "export function marked(): number { 'worklet'; return 1; }\n",
  'again.ts': "export { marked as again } from './marked';\n",
  'unmarked.ts': "export { plain as unmarked } from './plain';\n",
  'case.ts': '',
})) {
  writeFileSync(join(project, name), text);
}

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

const untyped = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

const typed = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: project },
  },
});

untyped.run('worklet-calls-worklets', rule, {
  valid: [
    { code: `${WORKLET}\nuseAnimatedStyle(() => ({ width: marked() }));` },
    { code: 'function f(callback) { return useAnimatedStyle(() => callback()); }' },
    {
      code: 'useAnimatedStyle(() => { const x = value.get(); value.set(x); value.modify(() => x); });',
    },
    {
      code: "import { withTiming } from 'react-native-reanimated';\nuseAnimatedStyle(() => ({ width: withTiming(1) }));",
    },
    { code: "import { scheduleOnUI } from 'react-native-worklets';\nscheduleOnUI(() => 1);" },
    { code: 'useDerivedValue(() => { const inner = () => 1; return inner(); });' },
    { code: `${PLAIN}\nplain();` },
    { code: `${WORKLET}\nfunction other() { 'worklet'; return marked(); }` },
    { code: `${PLAIN}\nGesture.Pan().runOnJS(true).onUpdate(() => plain());` },
    { code: `${PLAIN}\nGesture.Pan().onUpdate(() => plain()).runOnJS(true);` },
    { code: `${WORKLET}\nGesture.Pan().onUpdate(marked);` },
    { code: `${PLAIN}\nOther.Pan().onUpdate(() => plain());` },
    { code: 'const object = {};\nuseAnimatedStyle(() => object.read());' },
    { code: "import { helper } from './helper';\nuseAnimatedStyle(() => helper());" },
    { code: 'useAnimatedStyle(1);' },
    { code: 'useAnimatedStyle(() => ns[name]());' },
  ],
  invalid: [
    {
      code: `${PLAIN}\nuseAnimatedStyle(() => ({ width: plain() }));`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: 'const plain = () => 1;\nuseDerivedValue(() => plain());',
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nfunction w() { 'worklet'; return plain(); }`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nuseAnimatedStyle(() => plain.call(null));`,
      errors: [{ messageId: 'call', data: { name: 'plain.call' } }],
    },
    {
      code: `${PLAIN}\nuseAnimatedStyle(function () { 'worklet'; return plain(); });`,
      errors: [{ messageId: 'call' }],
    },
    {
      code: `${PLAIN}\nwithTiming(1, {}, () => plain());`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nuseAnimatedScrollHandler({ onScroll: () => plain(), other: 1 });`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nGesture.Pan().onUpdate(() => plain());`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nGesture.Pan().runOnJS(false).onUpdate(() => plain());`,
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      code: `${PLAIN}\nGesture.Tap().onEnd(plain);`,
      errors: [{ messageId: 'callback', data: { name: 'plain' } }],
    },
  ],
});

typed.run('worklet-calls-worklets with type information', rule, {
  valid: [
    {
      filename: caseFile,
      code: "import { marked } from './marked';\nuseAnimatedStyle(() => ({ width: marked() }));",
    },
    {
      filename: caseFile,
      code: "import { again } from './again';\nuseAnimatedStyle(() => ({ width: again() }));",
    },
    {
      filename: caseFile,
      code: "import { marked } from './marked';\nGesture.Pan().onUpdate(marked);",
    },
    {
      filename: caseFile,
      code: "import { missing } from './missing';\nuseAnimatedStyle(() => missing());",
    },
  ],
  invalid: [
    {
      filename: caseFile,
      code: "import { plain } from './plain';\nuseAnimatedStyle(() => ({ width: plain() }));",
      errors: [{ messageId: 'call', data: { name: 'plain' } }],
    },
    {
      filename: caseFile,
      code: "import { unmarked } from './unmarked';\nuseAnimatedStyle(() => unmarked());",
      errors: [{ messageId: 'call', data: { name: 'unmarked' } }],
    },
    {
      filename: caseFile,
      code: "import { plain } from './plain';\nGesture.Pan().onUpdate(plain);",
      errors: [{ messageId: 'callback', data: { name: 'plain' } }],
    },
  ],
});
