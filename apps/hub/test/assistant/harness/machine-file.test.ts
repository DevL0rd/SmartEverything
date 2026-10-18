import { describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult, ToolCaller } from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { machineFileReader } from '../../../src/plugins/machine-file';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const READ_FILES: HubTool = {
  name: 'read_files',
  title: 'Read files',
  description: 'Read a file',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

function toolsReturning(
  response: Record<string, unknown>,
  asked: Record<string, unknown>[],
): ToolHub {
  return new ToolHub([
    {
      tools: (): HubTool[] => [READ_FILES],
      call: (_tool, args): Promise<HubToolResult> => {
        asked.push(args);
        return Promise.resolve({ response, line: '', pictures: [] });
      },
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
}

function ownerCaller(): ToolCaller {
  return {
    profileId: rig.owner.profileId,
    role: 'owner',
    chatId: null,
    via: 'plugin',
    clientId: null,
  };
}

describe('reading a file from another machine for a plugin', () => {
  it('reads it with the same read_files tool the AI uses and returns the bytes', async () => {
    const asked: Record<string, unknown>[] = [];
    const read = machineFileReader({
      tools: toolsReturning(
        {
          name: 'CLAUDE.md',
          path: '/home/sam/.claude/CLAUDE.md',
          size: 5,
          mimeType: 'text/markdown',
          encoding: 'text',
          content: 'hello',
        },
        asked,
      ),
      harness: rig.service,
    });

    const file = await read(ownerCaller(), {
      machine: 'desk',
      path: '/home/sam/.claude/CLAUDE.md',
    });

    expect(file?.name).toBe('CLAUDE.md');
    expect(file?.data.toString()).toBe('hello');
    expect(asked).toStrictEqual([
      {
        view: 'file',
        deviceId: rig.desk.target.kind === 'device' ? rig.desk.target.device_id : '',
        path: '/home/sam/.claude/CLAUDE.md',
      },
    ]);
  });

  it('decodes binary files', async () => {
    const read = machineFileReader({
      tools: toolsReturning(
        {
          name: 'a.bin',
          path: '/a.bin',
          size: 3,
          mimeType: 'application/octet-stream',
          encoding: 'base64',
          content: Buffer.from('abc').toString('base64'),
        },
        [],
      ),
      harness: rig.service,
    });

    const file = await read(ownerCaller(), { machine: 'Desk', path: '/a.bin' });

    expect(file?.data.toString()).toBe('abc');
  });

  it('leaves the home hub’s own machine to a local read', async () => {
    const asked: Record<string, unknown>[] = [];
    const read = machineFileReader({ tools: toolsReturning({}, asked), harness: rig.service });

    expect(await read(ownerCaller(), { machine: 'hub', path: '/etc/hostname' })).toBeNull();
    expect(asked).toStrictEqual([]);
  });

  it('names the machines there are when none matches', async () => {
    const read = machineFileReader({ tools: toolsReturning({}, []), harness: rig.service });

    await expect(read(ownerCaller(), { machine: 'Attic', path: '/x' })).rejects.toThrow(
      /No machine is called "Attic"/u,
    );
  });
});
