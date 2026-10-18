import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

const require = createRequire(import.meta.url);
const distribution = join(dirname(require.resolve('@shopify/flash-list/package.json')), 'dist');

function declarations(file: string): string {
  return readFileSync(join(distribution, file), 'utf8');
}

describe('@shopify/flash-list contract', () => {
  it('is declared at the installed version by the app', () => {
    expect(declaredVersion(APP_MANIFEST, '@shopify/flash-list')).toBe(
      installedVersion('@shopify/flash-list'),
    );
  });
  it('is the recycling 2.x line', () => {
    expect(installedVersion('@shopify/flash-list')).toMatch(/^2\./);
  });
  it('exposes the list props the shared virtual list relies on', () => {
    const props = declarations('FlashListProps.d.ts');
    for (const name of [
      'getItemType',
      'drawDistance',
      'viewabilityConfigCallbackPairs',
      'onEndReached',
      'ListHeaderComponent',
      'ListEmptyComponent',
      'ListFooterComponent',
      'CellRendererComponent',
      'maintainVisibleContentPosition',
      'inverted',
    ]) {
      expect(props).toContain(`${name}?:`);
    }
    expect(props).toContain('extends Omit<ScrollViewProps, "maintainVisibleContentPosition">');
  });
  it('draws sticky headers from the data index, not from a native header offset', () => {
    const sticky = readFileSync(
      join(distribution, 'recyclerview/components/StickyHeaders.js'),
      'utf8',
    );
    expect(sticky).toContain('data[currentStickyIndex]');
  });
  it('exposes the scroll handle the screens use', () => {
    const ref = declarations('FlashListRef.d.ts');
    for (const name of ['scrollToTop', 'scrollToOffset', 'scrollToIndex', 'scrollToEnd']) {
      expect(ref).toContain(`${name}:`);
    }
  });
});
