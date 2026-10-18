import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const LOOP = /withRepeat\(|useFrameCallback\(|loopStyle\(/;

const GATE = /from '[./]*design\/animation-gate'/;

const GATED_BY_CALLER: Readonly<Record<string, string>> = {
  'src/features/device-visuals/': 'device-visual.tsx gates every visual and passes moving',
  'src/features/weather/visual/': 'weather-visual.tsx gates every layer and passes moving',
  'src/components/widget-board/edit/use-widget-motion.ts': 'editable-widget.tsx gates the jiggle',
  'src/components/widget-board/edit/drag-state.ts':
    'the auto-scroll frame callback runs only while dragging',
};

function gatedByCaller(file: string): boolean {
  return Object.keys(GATED_BY_CALLER).some((prefix) => file.startsWith(prefix));
}

const ALWAYS_ON_SCREEN = [
  'src/components/skeleton.tsx',
  'src/components/widget-board/edit/editable-widget.tsx',
  'src/features/assistant/call/components/call-wave.tsx',
];

const sources = filesUnder(applicationSource).filter(
  (file) =>
    /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith('design/loops.ts'),
);

describe('animation loops', () => {
  it('every repeating animation goes through the shared animation gate', () => {
    const withoutGate = sources
      .filter((file) => LOOP.test(readFileSync(file, 'utf8')))
      .map(insideApp)
      .filter((file) => !gatedByCaller(file))
      .filter((file) => !GATE.test(readFileSync(`${applicationSource}/../${file}`, 'utf8')));
    expect(withoutGate).toEqual([]);
  });

  it('every caller-gated entry still exists and still loops', () => {
    for (const prefix of Object.keys(GATED_BY_CALLER)) {
      const matches = sources
        .filter((file) => insideApp(file).startsWith(prefix))
        .filter((file) => LOOP.test(readFileSync(file, 'utf8')));
      expect(matches.length, prefix).toBeGreaterThan(0);
    }
  });

  it('every gate is told whether its element is on screen', () => {
    const always = sources
      .filter((file) => /useAnimationGate\(.+,\s*true\)/.test(readFileSync(file, 'utf8')))
      .map(insideApp);
    expect(always).toEqual(ALWAYS_ON_SCREEN);
  });

  it('every list scopes each row to the rows the list reports as viewable', () => {
    for (const file of [
      'src/components/virtual-list.tsx',
      'src/features/assistant/components/thread-items.tsx',
    ]) {
      expect(readFileSync(`${applicationSource}/../${file}`, 'utf8'), file).toContain('<RowScope');
    }
  });
});
