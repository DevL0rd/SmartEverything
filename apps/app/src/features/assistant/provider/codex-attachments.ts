import {
  COMPUTER_RUNTIME_MODEL,
  PROVIDER_IMAGE_MIME,
  type AiChatRow,
} from '@smarteverything/domain';
import { useUploads, type Upload } from '../data/uploads';
import { useEngineCatalogue } from './provider-data';

export function useUnsupportedUploads(chat: AiChatRow): readonly Upload[] {
  const uploads = useUploads();
  const images = useCodexImages(chat);
  if (chat.engine.kind !== 'codex' || uploads.length === 0) return [];
  return uploads.filter((upload) => !upload.mime.startsWith('image/') || images !== true);
}

export function useUnsupportedHelperUploads(
  chat: AiChatRow | null,
  uploads: readonly Upload[],
): readonly Upload[] {
  const images = useCodexImages(chat);
  if (chat?.engine.kind !== 'codex') return [];
  return uploads.filter(
    ({ mime }) =>
      mime === 'application/pdf' ||
      (images === false && PROVIDER_IMAGE_MIME.safeParse(mime).success),
  );
}

function useCodexImages(chat: AiChatRow | null): boolean | null {
  const catalogue = useEngineCatalogue();
  if (chat?.engine.kind !== 'codex') return null;
  const engine = chat.engine;
  const computer = catalogue.data?.computers.find(
    (row) => row.runtime === 'codex' && row.device_id === engine.device_id,
  );
  const model = computer?.models.find(
    (row) => row.id === engine.model || row.resolved_model === engine.model,
  );
  const parsed = COMPUTER_RUNTIME_MODEL.safeParse(model);
  return parsed.success ? parsed.data.input_modalities.includes('image') : null;
}

export function unsupportedReason(unsupported: readonly Upload[]): string | null {
  return unsupported.length === 0
    ? null
    : `Codex can’t read ${unsupported.map((upload) => upload.name).join(', ')} with this model.`;
}
