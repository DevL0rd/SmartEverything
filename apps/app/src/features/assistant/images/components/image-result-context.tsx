import type { ReactNode } from 'react';
import type { AssistantAttachment } from '@smarteverything/domain';
import { Text } from '../../../../components/text';
import { useRows } from '../../../../store/selectors';
import { useImageOperations } from '../data/image-queries';

function ResultLineage({
  chatId,
  image,
}: {
  readonly chatId: string;
  readonly image: AssistantAttachment;
}): ReactNode {
  const operations = useImageOperations(chatId);
  const rows = useRows('assistant_messages');
  const operation = operations.data?.find((receipt) =>
    receipt.results.some((result) => result.attachment.id === image.id),
  );
  if (operation === undefined) return null;
  const source = operation.inputs.find((input) => input.role === 'source');
  const references = operation.inputs.filter((input) => input.role === 'reference');
  const parent = rows
    .flatMap((row) => row.attachments)
    .find((item) => item.id === source?.attachment_id);
  const origin =
    source === undefined
      ? references.length > 0
        ? `Created with ${String(references.length)} reference${references.length === 1 ? '' : 's'}`
        : 'Created image'
      : `Edited from ${parent?.name ?? 'an earlier image'} · original preserved`;
  return <Text variant="caption" tone="variant">{`Saved to this chat · ${origin}`}</Text>;
}

export function ImageResultContext({
  image,
  chatId,
}: {
  readonly image: AssistantAttachment;
  readonly chatId?: string | undefined;
}): ReactNode {
  const rows = useRows('assistant_messages');
  const home = rows.find((row) => row.attachments.some((file) => file.id === image.id));
  const targetChat = home?.chat_id ?? chatId;
  return targetChat === undefined ? null : <ResultLineage chatId={targetChat} image={image} />;
}
