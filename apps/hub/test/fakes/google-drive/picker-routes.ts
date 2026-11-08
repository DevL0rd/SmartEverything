import { bytesReply, failure, jsonReply, type Bytes } from './content';

export interface PickSpec {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly createTime: string;
  readonly type: 'PHOTO' | 'VIDEO';
  readonly content: Bytes;
  readonly processing?: string;
}

export const MEDIA_HOST = 'lh3.googleusercontent.com';

export interface PickerState {
  readonly sessions: Map<string, { picked: boolean }>;
  readonly choices: PickSpec[];
  pageSize: number;
  readonly timeoutSeconds: number;
}

function itemView(spec: PickSpec): Record<string, unknown> {
  return {
    id: spec.id,
    createTime: spec.createTime,
    type: spec.type,
    mediaFile: {
      baseUrl: `https://${MEDIA_HOST}/pk/${spec.id}`,
      mimeType: spec.mimeType,
      filename: spec.filename,
      ...(spec.processing === undefined
        ? {}
        : { mediaFileMetadata: { videoMetadata: { processingStatus: spec.processing } } }),
    },
  };
}

function sessionView(state: PickerState, id: string): Response {
  const session = state.sessions.get(id);
  if (session === undefined) {
    return failure(404);
  }
  return jsonReply(200, {
    id,
    pickerUri: `https://photos.google.com/picker/${id}`,
    pollingConfig: { pollInterval: '0.005s', timeoutIn: `${String(state.timeoutSeconds)}s` },
    mediaItemsSet: session.picked,
  });
}

export function createSession(state: PickerState): Response {
  const id = `picker-${String(state.sessions.size + 1)}`;
  state.sessions.set(id, { picked: false });
  return sessionView(state, id);
}

export function readSession(state: PickerState, id: string): Response {
  return sessionView(state, id);
}

export function closeSession(state: PickerState, id: string): Response {
  state.sessions.delete(id);
  return new Response(null, { status: 200 });
}

export function listPicked(state: PickerState, query: URLSearchParams): Response {
  const session = state.sessions.get(query.get('sessionId') ?? '');
  if (session?.picked !== true) {
    return failure(400);
  }
  const from = Number(query.get('pageToken') ?? '0');
  const page = state.choices.slice(from, from + state.pageSize);
  const next = from + state.pageSize;
  return jsonReply(200, {
    mediaItems: page.map(itemView),
    ...(next < state.choices.length ? { nextPageToken: String(next) } : {}),
  });
}

export function downloadPicked(state: PickerState, id: string, suffix: string): Response {
  const spec = state.choices.find((choice) => choice.id === id);
  if (spec === undefined || !['d', 'dv'].includes(suffix)) {
    return failure(404);
  }
  return bytesReply(spec.content);
}
