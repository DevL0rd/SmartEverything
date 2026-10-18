import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const moduleRoot = join(repositoryRoot, 'apps', 'app', 'modules');
const gradleFiles = filesUnder(moduleRoot).filter(
  (file) => file.endsWith('.gradle') && !file.includes('/build/'),
);
const nativeSources = filesUnder(moduleRoot).filter(
  (file) => /\.(kt|java)$/.test(file) && !file.includes('/build/'),
);
const secondRuntime =
  /com\.microsoft\.onnxruntime|onnxruntime-android|android-vad|ai\.onnxruntime|com\.konovalov/;

describe('one ONNX Runtime', () => {
  it('finds the module sources', () => {
    expect(gradleFiles.length).toBeGreaterThan(0);
    expect(nativeSources.length).toBeGreaterThan(0);
  });

  it('keeps sherpa-onnx the only library that brings libonnxruntime.so, so the packaged copy always matches its JNI', () => {
    const offenders = [...gradleFiles, ...nativeSources].filter((file) =>
      secondRuntime.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('never lets the packager silently pick one of two libonnxruntime.so copies', () => {
    const config = readFileSync(join(repositoryRoot, 'apps', 'app', 'app.config.ts'), 'utf8');
    expect(config).not.toMatch(/pickFirst|libonnxruntime/);
  });
});
