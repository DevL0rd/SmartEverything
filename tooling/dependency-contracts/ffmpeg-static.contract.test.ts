import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { repositoryFile } from './versions';

const hubRequire = createRequire(repositoryFile('apps/hub/package.json'));

describe('ffmpeg-static contract', () => {
  it('exports the path of an executable ffmpeg for this platform', () => {
    const path = z.string().parse(hubRequire('ffmpeg-static'));
    expect(() => {
      accessSync(path, constants.X_OK);
    }).not.toThrow();
  });

  it('runs that ffmpeg with the filters and encoders the camera features use', () => {
    const path = z.string().parse(hubRequire('ffmpeg-static'));
    const filters = execFileSync(path, ['-hide_banner', '-filters'], { encoding: 'utf8' });
    const encoders = execFileSync(path, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    expect(filters).toMatch(/\bspeechnorm\b/u);
    expect(filters).toMatch(/\bhighpass\b/u);
    expect(encoders).toMatch(/\blibopus\b/u);
    expect(encoders).toMatch(/\blibx264\b/u);
    expect(encoders).toMatch(/\bmjpeg\b/u);
  });
});
