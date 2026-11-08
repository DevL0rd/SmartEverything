import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { pluginFiles } from '../../src/plugins/plugin-assistant';

describe('pluginFiles', () => {
  it('roots the folder and outbox at the plugin folder and keeps the readers', () => {
    const layout = hubLayout('/hub-root', {});
    const folder = layout.system.plugins('discord');
    const readers = {
      attachmentsOf: (): string[] => ['a'],
      fromMachine: (): Promise<null> => Promise.resolve(null),
      fromUpload: (): Promise<null> => Promise.resolve(null),
      fromPicture: (): Promise<null> => Promise.resolve(null),
    };
    const files = pluginFiles(folder, readers);
    expect(files.folder).toBe(folder);
    expect(files.outbox).toBe(join(folder, 'outbox'));
    expect(files.attachmentsOf('chat')).toEqual(['a']);
    expect(files.fromMachine).toBe(readers.fromMachine);
    expect(files.fromUpload).toBe(readers.fromUpload);
    expect(files.fromPicture).toBe(readers.fromPicture);
  });
});
