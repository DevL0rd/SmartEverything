import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const hubSource = join(repositoryRoot, 'apps', 'hub', 'src');

interface OutputRule {
  readonly pattern: RegExp;
  readonly owners: readonly string[];
}

const CAMERA_AUDIO_OUTPUT: readonly OutputRule[] = [
  { pattern: /go2rtc\s*\.\s*play\s*\(/, owners: ['talk/camera-speaker.ts'] },
  { pattern: /#audio=/, owners: ['talk/camera-speaker.ts'] },
  { pattern: /feeds\s*\.\s*open\s*\(/, owners: ['talk/speaker-output.ts'] },
  { pattern: /new\s+TalkFeeds\s*\(/, owners: ['talk/talk-service.ts'] },
  { pattern: /new\s+CameraOutput\s*\(/, owners: ['talk/camera-speaker.ts'] },
  { pattern: /new\s+CameraSpeakers\s*\(/, owners: ['talk/talk-service.ts'] },
  { pattern: /backchannel/i, owners: [] },
];

function offenders(): string[] {
  return filesUnder(hubSource)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => {
      const path = relative(hubSource, file).replace(/\\/g, '/');
      const text = readFileSync(file, 'utf8');
      return CAMERA_AUDIO_OUTPUT.filter(
        (rule) => rule.pattern.test(text) && !rule.owners.includes(path),
      ).map((rule) => `${path}: ${String(rule.pattern)}`);
    });
}

describe('one camera speaker owner', () => {
  it('lets only the camera speaker module open an audio output to a camera', () => {
    expect(offenders()).toEqual([]);
  });
});
