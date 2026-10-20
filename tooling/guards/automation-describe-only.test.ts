import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTestPath, repositorySourcePaths } from './automation-sources';
import { repositoryRoot } from './repository-files';

const PROGRAM_READERS: readonly RegExp[] = [
  /^packages\/flow\//,
  /^apps\/hub\/src\/automations\//,
  /^apps\/hub\/src\/store\//,
  /^packages\/domain\/src\/automation-v3\//,
  /^packages\/domain\/src\/automation-nodes\//,
  /^packages\/domain\/src\/api\/endpoints-automation-/,
  /^packages\/domain\/src\/device-log\.ts$/,
  /^apps\/app\/src\/features\/automations\/(?:editor|functions|model\/canvas|model\/editor|model\/templates|model\/consumers)\//,
  /^apps\/app\/src\/features\/automations\/runs\/run-view\/program-facts\.ts$/,
];

const PROGRAM_READ =
  /\w*(?:[pP]rogram|[dD]efinition|[aA]utomation|[dD]raft)\??\.(?:triggers|onFailure|body\??\.nodes)\b/;

const isReader = (path: string): boolean => PROGRAM_READERS.some((pattern) => pattern.test(path));

describe('reads of an automation program', () => {
  it('stay inside the flow package, the hub engine, domain describe and the editor', () => {
    const offences = repositorySourcePaths()
      .filter((path) => !isTestPath(path) && !isReader(path))
      .filter((path) => PROGRAM_READ.test(readFileSync(join(repositoryRoot, path), 'utf8')))
      .map((path) => `${path} reads program triggers or body`);
    expect(offences).toEqual([]);
  });
});
