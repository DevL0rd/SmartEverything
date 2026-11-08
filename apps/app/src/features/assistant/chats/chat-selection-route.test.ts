import { expect, it } from 'vitest';
import { chatSelectionParams } from './chat-selection-route';

it('clears the open panel, browser action and provider work when selecting another chat', () => {
  const current = {
    chatId: 'old',
    section: 'browser',
    operation: 'access-tools',
    work: 'files',
    browserAction: 'reload',
    message: 'old-message',
  };
  const next = { ...current, ...chatSelectionParams('new', 'new-message') };
  expect(Object.entries(next).filter(([, value]) => value !== undefined)).toEqual([
    ['chatId', 'new'],
    ['message', 'new-message'],
  ]);
});
