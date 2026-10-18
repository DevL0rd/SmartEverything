import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const call = vi.fn();
vi.mock('../../api/transport', () => ({ api: (): { call: typeof call } => ({ call }) }));

const { readTranscriptPage, readTranscriptRange } = await import('./transcript-requests');
const { deleteTranscript, deleteTranscriptLine } = await import('../../api/transcripts');
const { transcriptReaderKey } = await import('./selection');

beforeEach(() => {
  call.mockReset();
  call.mockResolvedValue({});
});

describe('reading a transcript feed', () => {
  it('reads the feed of one source and searches only when words are given', async () => {
    await readTranscriptPage(
      { source: 'camera', sourceId: 'cam-1' },
      { words: '', limit: 50, direction: 'before' },
    );
    expect(call).toHaveBeenLastCalledWith(E.readCameraTranscriptFeed, {
      query: { source: 'camera', sourceId: 'cam-1', limit: 50, direction: 'before' },
    });
    await readTranscriptPage(
      { sessionId: 'session-1' },
      { words: 'door', limit: 50, direction: 'after', cursor: 'c1' },
    );
    expect(call).toHaveBeenLastCalledWith(E.searchCameraTranscriptFeed, {
      query: { sessionId: 'session-1', limit: 50, direction: 'after', cursor: 'c1', q: 'door' },
    });
  });

  it('loads context around a line within the same selection', async () => {
    await readTranscriptRange({ sessionId: 'session-1' }, 7, 50);
    expect(call).toHaveBeenLastCalledWith(E.readCameraTranscriptRange, {
      query: { sessionId: 'session-1', anchor: 7, limit: 50 },
    });
  });

  it('keeps readers of different selections, searches and anchors apart', () => {
    const keys = [
      transcriptReaderKey({ source: 'camera' }, '', null),
      transcriptReaderKey({ source: 'camera', sourceId: 'cam-1' }, '', null),
      transcriptReaderKey({ sessionId: 's' }, '', null),
      transcriptReaderKey({ sessionId: 's' }, 'door', null),
      transcriptReaderKey({ sessionId: 's' }, '', 4),
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('deleting transcripts', () => {
  it('deletes one line only when a line is named and the whole transcript otherwise', async () => {
    await deleteTranscriptLine('session-1', 9);
    expect(call).toHaveBeenLastCalledWith(E.removeTranscript, {
      params: { sessionId: 'session-1' },
      query: { lineId: 9 },
    });
    await deleteTranscript('session-1');
    expect(call).toHaveBeenLastCalledWith(E.removeTranscript, {
      params: { sessionId: 'session-1' },
    });
  });
});
