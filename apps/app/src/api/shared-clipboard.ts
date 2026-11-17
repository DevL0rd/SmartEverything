import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from './transport';

export async function writeSharedClipboard(text: string): Promise<void> {
  await api().call(E.writeSharedClipboard, { body: { text } });
}
