import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const STILL_FLAT = new Set([
  'src/features/assistant/components/thread-items.tsx',
  'src/features/assistant/components/use-thread-scroll.ts',
  'src/features/assistant/components/image-viewer.tsx',
]);

const FLAT_IMPORT = /import[^;]*\bFlatList\b[^;]*from 'react-native'/u;

const sources = filesUnder(applicationSource)
  .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file))
  .map((file) => ({ path: insideApp(file), text: readFileSync(file, 'utf8') }));

describe('recycling lists', () => {
  it('keeps every list on FlashList except the chat thread (pinned reply anchoring) and the paged image viewer', () => {
    const flat = sources
      .filter((source) => FLAT_IMPORT.test(source.text))
      .map((source) => source.path);
    expect(flat.filter((path) => !STILL_FLAT.has(path))).toEqual([]);
  });

  it('does not keep an allowance for a file that no longer uses FlatList', () => {
    const flat = new Set(
      sources.filter((source) => FLAT_IMPORT.test(source.text)).map((source) => source.path),
    );
    expect([...STILL_FLAT].filter((path) => !flat.has(path))).toEqual([]);
  });

  it('keeps the console, transcript feed and search results on FlashList without FlatList-only props', () => {
    const converted = [
      'src/features/assistant/browser/browser-console.tsx',
      'src/components/transcript-feed/transcript-feed.tsx',
      'src/search/result-list.tsx',
    ];
    for (const path of converted) {
      const text = sources.find((source) => source.path === path)?.text ?? '';
      expect(text, path).toContain("from '@shopify/flash-list'");
      expect(text, path).not.toMatch(
        /onScrollToIndexFailed|windowSize=|initialNumToRender|maxToRenderPerBatch|minIndexForVisible/u,
      );
    }
  });

  it('keeps the shared virtual list on FlashList with sticky headers drawn by the list', () => {
    const list = sources.find((source) => source.path === 'src/components/virtual-list.tsx');
    expect(list?.text).toContain("from '@shopify/flash-list'");
    expect(list?.text).toContain('stickyHeaderIndices');
    expect(list?.text).not.toMatch(/removeClippedSubviews|getItemLayout/u);
  });
});
