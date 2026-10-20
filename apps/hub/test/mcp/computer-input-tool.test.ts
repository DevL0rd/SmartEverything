import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  mcpToolOperation,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import {
  USE_COMPUTER_INPUT,
  inputSummary,
  useComputer,
} from '../../src/extensions/mcp/tools/computer-input';
import { toolNamed } from '../../src/extensions/mcp/tools';
import { pictureSizeOf } from '../../src/extensions/mcp/tools/see';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const DEVICE = randomUUID();
const PICTURE = Buffer.from('jpeg').toString('base64');

interface Call {
  readonly name: EndpointName;
  readonly body: unknown;
}

let opened: TestStore;
let calls: Call[];
let owner: ClientRow;
let captureFails: boolean;
let pictureBytes: number;

function operating(): OperatingContext {
  return {
    store: opened.store,
    caller: null,
    actor: {
      clientId: owner.id,
      profileId: opened.store.profiles.first().id,
      chatId: null,
    },
    operations: {
      run: (name, _caller, input): Promise<unknown> => {
        const endpoint = API_ENDPOINTS[name];
        endpoint.params.parse(input.params ?? {});
        if (input.body !== undefined) endpoint.body.parse(input.body);
        calls.push({ name, body: input.body });
        if (name === 'captureComputer') {
          return captureFails
            ? Promise.reject(new Error('Screenshots are turned off for this computer.'))
            : Promise.resolve({
                mimeType: 'image/jpeg',
                data: pictureBytes === 0 ? PICTURE : Buffer.alloc(pictureBytes).toString('base64'),
                width: 10,
                height: 10,
                at: '2026-10-18T10:00:00.000Z',
              });
        }
        return Promise.resolve({ done: true });
      },
    },
  };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  captureFails = false;
  pictureBytes = 0;
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
});

afterEach(async () => {
  await opened.close();
});

describe('the use_computer tool', () => {
  it('sends the input to its computer without the look flag and answers with a summary', async () => {
    const answer = await useComputer(
      operating(),
      USE_COMPUTER_INPUT.parse({ deviceId: DEVICE, action: 'click', x: 10, y: 20 }),
    );
    expect(calls).toEqual([{ name: 'inputComputer', body: { action: 'click', x: 10, y: 20 } }]);
    expect(answer).toEqual({ structured: { ok: true, summary: 'Clicked at (10, 20)' } });
  });

  it('returns a picture of the screen right after the input when asked to look', async () => {
    const answer = await useComputer(
      operating(),
      USE_COMPUTER_INPUT.parse({ deviceId: DEVICE, action: 'keys', keys: 'ctrl+l', look: true }),
    );
    expect(calls.map((call) => call.name)).toEqual(['inputComputer', 'captureComputer']);
    expect(calls[1]?.body).toEqual({ target: 'screen' });
    expect(answer.images).toEqual([{ data: PICTURE, mimeType: 'image/jpeg' }]);
    expect(answer.structured['summary']).toBe('Pressed ctrl+l');
    expect(String(answer.structured['pictureSize'])).toContain('10x10 pixels');
  });

  it('says the input was done when the picture fails, so it is not repeated', async () => {
    captureFails = true;
    const answer = await useComputer(
      operating(),
      USE_COMPUTER_INPUT.parse({ deviceId: DEVICE, action: 'move', x: 1, y: 2, look: true }),
    );
    expect(answer.images).toBeUndefined();
    expect(answer.structured['ok']).toBe(true);
    expect(answer.structured['picture']).toContain('input was done');
  });

  it('says so when the picture is too large for an assistant', async () => {
    pictureBytes = 5 * 1024 * 1024;
    const answer = await useComputer(
      operating(),
      USE_COMPUTER_INPUT.parse({ deviceId: DEVICE, action: 'move', x: 1, y: 2, look: true }),
    );
    expect(answer.images).toBeUndefined();
    expect(answer.structured['picture']).toContain('too large');
  });

  it('states the pixel size that coordinates use', () => {
    expect(pictureSizeOf({ width: 3840, height: 2160 })).toContain('3840x2160 pixels');
  });

  it('never repeats typed text in its answer', async () => {
    const answer = await useComputer(
      operating(),
      USE_COMPUTER_INPUT.parse({ deviceId: DEVICE, action: 'type', text: 'my secret 😀' }),
    );
    expect(JSON.stringify(answer)).not.toContain('secret');
    expect(answer.structured['summary']).toBe('Typed 11 characters');
  });

  it('describes every other action', () => {
    expect(inputSummary({ action: 'double_click', x: 1, y: 2 })).toBe('Double clicked at (1, 2)');
    expect(inputSummary({ action: 'right_click', x: 1, y: 2 })).toBe('Right clicked at (1, 2)');
    expect(inputSummary({ action: 'move', x: 1, y: 2 })).toBe('Moved the pointer to (1, 2)');
    expect(inputSummary({ action: 'drag', x: 1, y: 2, toX: 3, toY: 4 })).toBe(
      'Dragged from (1, 2) to (3, 4)',
    );
    expect(inputSummary({ action: 'scroll', x: 1, y: 2, dx: 0, dy: -3 })).toBe(
      'Scrolled at (1, 2) by 0 across and -3 down',
    );
  });

  it('refuses a flat input that names an unknown action, misses a field or a key', () => {
    expect(USE_COMPUTER_INPUT.safeParse({ deviceId: DEVICE, action: 'teleport' }).success).toBe(
      false,
    );
    expect(USE_COMPUTER_INPUT.safeParse({ deviceId: DEVICE, action: 'click', x: 1 }).success).toBe(
      false,
    );
    expect(
      USE_COMPUTER_INPUT.safeParse({ deviceId: DEVICE, action: 'keys', keys: 'Banana' }).success,
    ).toBe(false);
    expect(
      USE_COMPUTER_INPUT.safeParse({ deviceId: DEVICE, action: 'scroll', x: 1, y: 1 }).success,
    ).toBe(false);
  });

  it('is a physical, answering tool that call_operation reaches', () => {
    expect(mcpToolOperation('use_computer')).toBe('inputComputer');
    const listing = toolNamed('use_computer')?.listing;
    expect(listing?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
    expect(listing?.description).toContain('screen picture');
  });
});
