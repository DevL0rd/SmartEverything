import { describe, expect, it } from 'vitest';
import { ARCHIVED_PAGE_SIZE, nextArchivedCursor } from './archived-chats';

function page(size: number): readonly { readonly id: string }[] {
  return Array.from({ length: size }, (_, index) => ({ id: `chat-${String(index)}` }));
}

describe('archived chat paging', () => {
  it('continues after the last chat of a full page of twenty', () => {
    expect(ARCHIVED_PAGE_SIZE).toBe(20);
    expect(nextArchivedCursor(page(20))).toBe('chat-19');
  });

  it('stops on a short page', () => {
    expect(nextArchivedCursor(page(19))).toBeUndefined();
    expect(nextArchivedCursor([])).toBeUndefined();
  });
});
