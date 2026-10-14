import { COMPUTER_RUNTIME_MODEL, type AiChatRow } from '@smarteverything/domain';
import { useUploads } from '../data/uploads';
import { useEngineCatalogue } from './provider-data';
export function useCodexAttachmentReason(chat: AiChatRow): string | null {
  const uploads = useUploads();
  const catalogue = useEngineCatalogue();
  if (chat.engine.kind !== 'codex' || uploads.length === 0) return null;
  const engine = chat.engine;
  const computer = catalogue.data?.computers.find(
    (row) => row.runtime === 'codex' && row.device_id === engine.device_id,
  );
  const model = computer?.models.find((row) => row.id === engine.model);
  const parsed = COMPUTER_RUNTIME_MODEL.safeParse(model);
  const images = parsed.success && parsed.data.input_modalities.includes('image');
  const unsupported = uploads.filter((upload) => !upload.mime.startsWith('image/') || !images);
  return unsupported.length === 0
    ? null
    : `Codex cannot accept ${unsupported.map((upload) => upload.name).join(', ')} with this model. Remove these attachments to send; text and supported images remain available.`;
}
