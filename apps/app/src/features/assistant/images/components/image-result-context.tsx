import type { ReactNode } from 'react';
import { createContext, use } from 'react';
import { Image, View } from 'react-native';
import type { AssistantAttachment, ImageOperationPreview } from '@smarteverything/domain';
import { Text } from '../../../../components/text';
import { DURATION } from '../../../../design/motion';
import { useRows } from '../../../../store/selectors';
import { useImageOperations } from '../data/image-queries';
import { previewBlur } from '../model/image-generation';

export interface ImageReveal {
  readonly preview: ImageOperationPreview;
  readonly seen: number;
  readonly attachmentIds: ReadonlySet<string>;
}

const RevealContext = createContext<ImageReveal | null>(null);

export function ImageRevealProvider({
  reveal,
  children,
}: {
  readonly reveal: ImageReveal | null;
  readonly children: ReactNode;
}): ReactNode {
  return <RevealContext value={reveal}>{children}</RevealContext>;
}

function useRevealFor(attachmentId: string): ImageReveal | null {
  const reveal = use(RevealContext);
  return reveal?.attachmentIds.has(attachmentId) === true ? reveal : null;
}

export function previewUri(preview: ImageOperationPreview): string {
  return `data:${preview.mime};base64,${preview.data}`;
}

export function ImageRevealUnder({ attachmentId }: { readonly attachmentId: string }): ReactNode {
  const reveal = useRevealFor(attachmentId);
  return (
    <View aria-hidden pointerEvents="none" className="absolute inset-0 bg-surface-3">
      {reveal === null ? null : (
        <Image
          source={{ uri: previewUri(reveal.preview) }}
          blurRadius={previewBlur(reveal.seen)}
          resizeMode="cover"
          className="size-full"
        />
      )}
    </View>
  );
}

export function useImageRevealMs(attachmentId: string): number {
  return useRevealFor(attachmentId) === null ? DURATION.mediumOut : DURATION.long;
}

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
