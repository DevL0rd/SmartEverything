import { QueryClient } from '@tanstack/react-query';
import type { DriveComment, DriveCommentAdd } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';

vi.mock('expo-crypto', () => ({ randomUUID: (): string => crypto.randomUUID() }));
vi.mock('../../../api/drive', () => ({ addDriveComment: vi.fn(), editDriveComment: vi.fn() }));

const { addComment, deletedComment, pagesWithAdded, pagesWithComment, resolvedComment } =
  await import('./comment-writes');
const { addDriveComment } = await import('../../../api/drive');

const NOW = '2026-11-21T10:00:00.000Z';

function comment(id: string, parentId: string | null): DriveComment {
  return {
    id,
    itemId: 'item',
    authorProfileId: 'me',
    parentId,
    body: 'Hello',
    mentions: [],
    createdAt: NOW,
    editedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    deleted: false,
  };
}

function pages(next: string | null): Parameters<typeof pagesWithAdded>[0] {
  return {
    pages: [{ items: [{ root: comment('root', null), replies: [] }], next }],
    pageParams: [null],
  };
}

describe('comments shown at once', () => {
  it('adds a reply to its thread and a new thread after the last loaded one', () => {
    const replied = pagesWithAdded(pages(null), comment('reply', 'root'));
    expect(replied.pages[0]?.items[0]?.replies.map((reply) => reply.id)).toEqual(['reply']);
    const started = pagesWithAdded(pages(null), comment('new', null));
    expect(started.pages[0]?.items.map((thread) => thread.root.id)).toEqual(['root', 'new']);
  });

  it('leaves a new thread to the page that is not loaded yet', () => {
    const more = pages('cursor');
    expect(pagesWithAdded(more, comment('new', null))).toBe(more);
  });

  it('resolves, reopens and deletes in place', () => {
    const resolved = pagesWithComment(pages(null), 'root', (root) =>
      resolvedComment(root, true, 'me', NOW),
    );
    expect(resolved.pages[0]?.items[0]?.root).toMatchObject({ resolvedAt: NOW, resolvedBy: 'me' });
    expect(resolvedComment(comment('root', null), false, 'me', NOW).resolvedAt).toBeNull();
    expect(deletedComment(comment('root', null))).toMatchObject({ body: null, deleted: true });
  });

  it('sends the id of the shown comment so the saved one keeps it', async () => {
    const ITEM = 'd0000000-0000-4000-8000-000000000001';
    const ME = 'c0000000-0000-4000-8000-000000000001';
    const client = new QueryClient();
    const key = driveKey('comments', DRIVE_EVERYWHERE, ITEM);
    client.setQueryData(key, { pages: [{ items: [], next: null }], pageParams: [null] });
    vi.mocked(addDriveComment).mockImplementation((itemId: string, body: DriveCommentAdd) =>
      Promise.resolve({
        ...comment(body.id ?? 'missing', null),
        itemId,
        authorProfileId: ME,
      }),
    );
    const saved = await addComment(client, ME, ITEM, { body: 'Hi', parentId: null, mentions: [] });
    const sent = vi.mocked(addDriveComment).mock.calls[0]?.[1];
    expect(sent?.id).toBe(saved.id);
    const shown = client.getQueryData<ReturnType<typeof pages>>(key);
    expect(shown?.pages[0]?.items.map((thread) => thread.root.id)).toEqual([saved.id]);
  });
});
