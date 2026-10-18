import { API_ENDPOINTS as E, type ClipboardClip } from '@smarteverything/domain';
import { api } from './transport';

export function readSharedClipboard(): Promise<ClipboardClip | null> {
  return api().call(E.readSharedClipboard, {});
}

export async function writeSharedClipboard(text: string): Promise<void> {
  await api().call(E.writeSharedClipboard, { body: { text } });
}
