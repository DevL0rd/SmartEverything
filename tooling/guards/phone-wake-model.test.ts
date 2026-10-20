import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository-files';

const gradlePath = join(repositoryRoot, 'apps', 'app', 'modules', 'health-connect', 'android');
const gradle = readFileSync(join(gradlePath, 'build.gradle'), 'utf8');

describe('phone wake model', () => {
  it('packs the model files from a directory that holds all of them, so the listening service can install the model', () => {
    const source = /from "\$\{projectDir\}\/([^"]+wake-name-model)"/.exec(gradle)?.[1];
    expect(source).toBeDefined();
    const directory = resolve(gradlePath, source ?? '');
    const included = /include ([^\n]+)/.exec(gradle)?.[1] ?? '';
    const names = [...included.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '');
    expect(names).toEqual([
      'encoder.int8.onnx',
      'decoder.int8.onnx',
      'joiner.int8.onnx',
      'tokens.txt',
    ]);
    expect(names.filter((name) => !existsSync(join(directory, name)))).toEqual([]);
  });
});
