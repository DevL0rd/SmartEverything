import { describe, expect, it } from 'vitest';
import { editHref, showAllHref } from './group-links';

describe('showAllHref', () => {
  it('opens the group page for a named group', () => {
    expect(showAllHref({ kind: 'group', groupId: 'g1' })).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1' },
    });
  });

  it('opens the room lights page for the lights of a room and the room page otherwise', () => {
    expect(showAllHref({ kind: 'room', roomId: 'r1', families: ['light'] })).toStrictEqual({
      pathname: '/rooms/[roomId]/lights',
      params: { roomId: 'r1' },
    });
    expect(showAllHref({ kind: 'room', roomId: 'r1' })).toStrictEqual({
      pathname: '/rooms/[roomId]',
      params: { roomId: 'r1' },
    });
  });
});

describe('editHref', () => {
  it('asks the group page to open its editor', () => {
    expect(editHref({ kind: 'group', groupId: 'g1' })).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1', edit: '1' },
    });
  });

  it('falls back to the page of a room', () => {
    expect(editHref({ kind: 'room', roomId: 'r1', families: ['light'] })).toStrictEqual({
      pathname: '/rooms/[roomId]/lights',
      params: { roomId: 'r1' },
    });
  });
});
