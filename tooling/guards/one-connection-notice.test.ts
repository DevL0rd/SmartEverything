import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, repositoryRoot } from './repository-files';

const BANNER = /<Banner\b[\s\S]*?\/>/gu;

const HUB_OFFLINE = [
  /hub is offline/iu,
  /hub is not answering/iu,
  /hub is out of reach/iu,
  /(can’t|can't|cannot) reach (the|your) (home )?hub/iu,
  /offline · /iu,
  /hub (is back|answers|reconnects)/iu,
  /· reconnecting/iu,
];

function screens(): readonly string[] {
  return filesUnder(applicationSource).filter(
    (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
  );
}

function offenders(): readonly string[] {
  return screens().flatMap((file) => {
    const banners = readFileSync(file, 'utf8').match(BANNER) ?? [];
    return banners
      .filter((banner) => HUB_OFFLINE.some((pattern) => pattern.test(banner)))
      .map((banner) => `${relative(repositoryRoot, file)}: ${banner.replace(/\s+/gu, ' ')}`);
  });
}

describe('one connection notice', () => {
  it('leaves an unreachable Hub to the top-of-app notice, with no page banner saying so', () => {
    expect(offenders()).toEqual([]);
  });
});
