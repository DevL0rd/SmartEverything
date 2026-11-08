import { describe, expect, it } from 'vitest';
import { operationShape } from '../../src/extensions/mcp/tools/operation-shape';
import { withCallingChat, operationTool } from '../../src/extensions/mcp/tools/operation-tools';
import {
  checkedFields,
  filledFields,
  worksOutsideChat,
} from '../../src/extensions/mcp/tools/part-fields';

const CHAT = '3f1b2c8e-6f0a-4c1e-9a52-0d1c1f4e7a10';
const inChat = { actor: { clientId: null, profileId: CHAT, chatId: CHAT } };
const outside = { actor: { clientId: null, profileId: CHAT, chatId: null } };

it('targets the calling chat for a title update with no chat id', () => {
  const shape = operationShape('updateAiChat');
  const change = { title: 'Garden lights' };
  expect(withCallingChat(inChat, shape, change)).toEqual({ ...change, chatId: CHAT });
  expect(() => withCallingChat(outside, shape, change)).toThrow('chatId is needed');
});

describe('the image endpoint list', () => {
  it('does not list the chat id among its inputs', () => {
    const tool = operationTool('list_image_endpoints', 'listImageEndpoints');
    expect(JSON.stringify(tool.listing.inputSchema)).not.toContain('chatId');
  });

  it('reads for the calling chat when called from a chat', () => {
    expect(filledFields('list_image_endpoints', inChat, {})).toEqual({ chatId: CHAT });
  });

  it('reads without a chat from outside one', () => {
    const shape = operationShape('listImageEndpoints');
    expect(worksOutsideChat('list_image_endpoints')).toBe(true);
    expect(filledFields('list_image_endpoints', outside, {})).toEqual({});
    expect(() => withCallingChat(outside, shape, {})).toThrow('chatId is needed');
  });

  it('refuses a chat id argument from anywhere', () => {
    expect(() => {
      checkedFields('list_image_endpoints', { chatId: CHAT });
    }).toThrow('leave chatId out');
  });

  it('keeps image generation tied to a chat', () => {
    expect(worksOutsideChat('generate_image_operation')).toBe(false);
    expect(() => filledFields('generate_image_operation', outside, {})).toThrow(
      'works inside a chat',
    );
  });
});
