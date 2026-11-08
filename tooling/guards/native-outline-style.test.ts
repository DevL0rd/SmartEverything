import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationRoutes, applicationSource, filesUnder, insideApp } from './repository-files';

function nativeOutlineRemoval(source: string): readonly string[] {
  return source.split(/[\s"'`]+/).filter((token) => {
    const parts = token.split(':');
    const utility = parts.pop();
    return /^!?outline-none!?$/.test(utility ?? '') && !parts.includes('web');
  });
}

describe('native outline styles', () => {
  it('keeps outline removal off React Native hosts', () => {
    const offenders = [...filesUnder(applicationRoutes), ...filesUnder(applicationSource)]
      .filter((file) => /\.tsx?$/.test(file) && !/\.(test|web)\.tsx?$/.test(file))
      .filter((file) => nativeOutlineRemoval(readFileSync(file, 'utf8')).length > 0)
      .map(insideApp);
    expect(offenders).toEqual([]);
  });

  it('detects outline removal with native or state variants', () => {
    const source =
      '<TextInput className="outline-none focus:outline-none! android:outline-none" />';
    expect(nativeOutlineRemoval(source)).toEqual([
      'outline-none',
      'focus:outline-none!',
      'android:outline-none',
    ]);
    expect(nativeOutlineRemoval('<TextInput className="web:focus:outline-none" />')).toEqual([]);
  });
});
