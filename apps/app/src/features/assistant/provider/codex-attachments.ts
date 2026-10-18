import { COMPUTER_RUNTIME_MODEL, type AiChatRow } from '@smarteverything/domain';
import { useUploads, type Upload } from '../data/uploads';
import { useEngineCatalogue } from './provider-data';

export function useUnsupportedUploads(chat: AiChatRow): readonly Upload[] {
  const uploads = useUploads();
  const catalogue = useEngineCatalogue();
  if (chat.engine.kind !== 'codex' || uploads.length === 0) return [];
  const engine = chat.engine;
  const computer = catalogue.data?.computers.find(
    (row) => row.runtime === 'codex' && row.device_id === engine.device_id,
  );
  const model = computer?.models.find((row) => row.id === engine.model);
  const parsed = COMPUTER_RUNTIME_MODEL.safeParse(model);
  const images = parsed.success && parsed.data.input_modalities.includes('image');
  return uploads.filter((upload) => !upload.mime.startsWith('image/') || !images);
}

export function unsupportedReason(unsupported: readonly Upload[]): string | null {
  return unsupported.length === 0
    ? null
    : `Codex can’t read ${unsupported.map((upload) => upload.name).join(', ')} with this model.`;
}
