import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { PhotoSource } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { keepSourceItems } from '../../../api/photos';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, useLastChat } from '../../assistant';
import { photoKeys } from '../data';
import { NO_CHAT_HINT } from '../memories/actions';
import { SOURCE_COPY } from './copy';
import { sourceLinks, SOURCE_REV } from './source-links';
import { keptLine, nounCount, type SourceTile } from './source-model';

export interface ChatDeps {
  readonly fileUrl: (source: PhotoSource, id: string) => Promise<string | null>;
  readonly fetchBytes: (url: string) => Promise<ArrayBuffer>;
}

const LIVE: ChatDeps = {
  fileUrl: (source, id) => sourceLinks[source].resolve(id, SOURCE_REV, 'file'),
  fetchBytes: async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`The download failed with status ${String(response.status)}`);
    }
    return response.arrayBuffer();
  },
};

export function chatFileOf(
  source: PhotoSource,
  tile: SourceTile,
  deps: ChatDeps = LIVE,
): PickedFile {
  return {
    name: tile.name,
    mime: tile.mime,
    bytes: tile.bytes,
    preview: null,
    data: async (): Promise<ArrayBuffer> => {
      const url = await deps.fileUrl(source, tile.id);
      if (url === null) throw new Error(`The hub gave no link for ${tile.name}`);
      return deps.fetchBytes(url);
    },
  };
}

export interface SourceActions {
  readonly busy: boolean;
  readonly chatHint: string | null;
  readonly keep: (tiles: readonly SourceTile[]) => void;
  readonly toChat: (tiles: readonly SourceTile[]) => void;
}

function chatText(source: PhotoSource, tiles: readonly SourceTile[]): string {
  const first = tiles[0];
  if (tiles.length === 1 && first !== undefined) return `${first.name} added to the message field`;
  return `${nounCount(source, tiles.length)} added to the message field`;
}

function useRefresh(source: PhotoSource): () => void {
  const client = useQueryClient();
  return () => {
    background(
      client.invalidateQueries({ queryKey: photoKeys.source(source, null).slice(0, -1) }),
      'queries.invalidate_failed',
    );
    background(
      client.invalidateQueries({ queryKey: photoKeys.railCounts() }),
      'queries.invalidate_failed',
    );
  };
}

export function useSourceActions(source: PhotoSource, onDone: () => void): SourceActions {
  const mutation = useMutationState();
  const refresh = useRefresh(source);
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  return {
    busy: mutation.busy,
    chatHint: chatId === null ? NO_CHAT_HINT : null,
    keep: (tiles): void => {
      mutation.run(
        () =>
          keepSourceItems(
            source,
            tiles.map((tile) => tile.id),
          ),
        {
          label: `photos.sources.${source}.keep`,
          failure: SOURCE_COPY[source].keepFailure,
          onDone: (result) => {
            refresh();
            onDone();
            notify({ message: keptLine(source, result.kept), tone: 'positive' });
          },
        },
      );
    },
    toChat: (tiles): void => {
      if (chatId === null || tiles.length === 0) return;
      attachFiles(
        tiles.map((tile) => chatFileOf(source, tile)),
        chatId,
      );
      onDone();
      notify({
        message: chatText(source, tiles),
        tone: 'positive',
        action: {
          label: 'Open chat',
          onPress: () => {
            router.push(href.assistantChat(chatId));
          },
        },
      });
    },
  };
}
