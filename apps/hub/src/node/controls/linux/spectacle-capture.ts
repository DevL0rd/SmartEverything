import type { CaptureTarget, ComputerCapture } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { CaptureControl } from '../session-controls';
import { jpegSize } from './jpeg-size';
import { isKdePlasma, runtimeDirectory } from './session-environment';

const MODES: Readonly<Record<CaptureTarget, string>> = {
  screen: '--fullscreen',
  focused: '--activewindow',
};

export class SpectacleCapture implements CaptureControl {
  constructor(
    private readonly run: RunProgram,
    private readonly now: () => Date,
  ) {}

  async capture(target: CaptureTarget): Promise<ComputerCapture> {
    if (!isKdePlasma()) {
      throw new NodeFailureError(
        'not_supported',
        'Screenshots need KDE Plasma on this computer for now.',
      );
    }
    const path = join(runtimeDirectory(), `smarteverything-capture-${randomUUID()}.jpg`);
    try {
      await this.run('spectacle', ['--background', MODES[target], '--output', path]);
      const data = await readFile(path);
      const size = jpegSize(data);
      if (size === null) {
        throw new NodeFailureError('failed', 'The screenshot could not be read.');
      }
      return {
        mimeType: 'image/jpeg',
        data: data.toString('base64'),
        ...size,
        at: this.now().toISOString(),
      };
    } finally {
      await rm(path, { force: true });
    }
  }
}
