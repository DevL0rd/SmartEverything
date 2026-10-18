import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const root = join(import.meta.dirname, '..', '..');
const plugin = z.object({
  default: z.object({ rules: z.record(z.string(), z.custom<Rule.RuleModule>()) }),
});

let eslint: ESLint;

beforeAll(async () => {
  const loaded = plugin.parse(
    await import(pathToFileURL(join(root, 'tooling/eslint/rules.js')).href),
  );
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { local: loaded.default },
        rules: { 'local/no-stray-text': ['error', { textComponents: ['Overline'] }] },
      },
    ],
  });
});

async function strayLines(source: string): Promise<readonly number[]> {
  const [result] = await eslint.lintText(source, { filePath: 'sample.tsx' });
  return (result?.messages ?? []).map((message) => message.line);
}

describe('the no-stray-text rule', () => {
  it('flags a space literal rendered straight into a View', async () => {
    expect(await strayLines("const a = <View>{' '}<Row /></View>;")).toEqual([1]);
  });

  it('flags a space literal inside a fragment, whose parent is unknown', async () => {
    expect(await strayLines("const a = <>{' '}<Row /></>;")).toEqual([1]);
  });

  it('flags plain text and template literals inside a View', async () => {
    expect(await strayLines('const a = <View>hello{`${name}`}</View>;')).toEqual([1, 1]);
  });

  it('flags whitespace-only text without a newline, which React Native emits as a real child', async () => {
    expect(await strayLines('const a = <View> <Row /></View>;')).toEqual([1]);
  });

  it('flags whitespace-only text without a newline inside a fragment', async () => {
    expect(await strayLines('const a = <> <Row /></>;')).toEqual([1]);
  });

  it('allows text inside Text components, named text components and host elements', async () => {
    const source = [
      "const a = <Text>hello{' '}world</Text>;",
      'const b = <Animated.Text>{`x`}</Animated.Text>;',
      'const c = <Overline>Related</Overline>;',
      'const d = <title>Connect</title>;',
    ].join('\n');
    expect(await strayLines(source)).toEqual([]);
  });

  it('allows expressions, elements and whitespace-only layout text in a View', async () => {
    const source = [
      'const a = (',
      '  <View>',
      '    {label}',
      '    <Row />',
      '  </View>',
      ');',
    ].join('\n');
    expect(await strayLines(source)).toEqual([]);
  });
});
