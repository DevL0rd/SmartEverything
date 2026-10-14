import { nativeMediaAuthority } from './native-media-authority';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ApiError,
  HARNESS_NATIVE_MEDIA_NOTE_INPUT,
  type DshWriterClaim,
} from '@smarteverything/domain';
import type { AssistantFiles } from '../assistant/files';
import type { HarnessService } from './service';
import { StoreNotFoundError } from '../store/context';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { explicitNativeOriginal } from './native-media-reference';

const IMAGE = z.object({
  type: z.literal('image'),
  attachment: z.object({
    attachmentId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    bytes: z.int().positive(),
    name: z.string().optional(),
  }),
  original_attachment_id: z.uuid().optional(),
});
const CONTENT = z.object({ content: z.array(z.unknown()) });
type Input = z.infer<typeof HARNESS_NATIVE_MEDIA_NOTE_INPUT>;
interface RetainedImage {
  readonly image: z.infer<typeof IMAGE>;
  readonly event: ReturnType<HarnessService['store']['dshSessions']['read']>['events'][number];
}

export async function nativeMediaNote(
  service: HarnessService,
  files: AssistantFiles,
  claim: DshWriterClaim,
  raw: unknown,
): Promise<string> {
  const input = HARNESS_NATIVE_MEDIA_NOTE_INPUT.parse(raw);
  const scope = nativeMediaAuthority(service, claim);
  const retained = retainedImage(service, claim.session_id, scope.profileId, input);
  const image = retained.image.attachment;
  const data = Buffer.from(input.data, 'base64');
  if (
    data.toString('base64') !== input.data ||
    data.byteLength !== image.bytes ||
    createHash('sha256').update(data).digest('hex') !== image.attachmentId.slice(7)
  )
    throw new ApiError(
      'conflict',
      'Native media bytes differ from their exact admitted image reference.',
    );
  const original = originalImage(service, retained, {
    sessionId: claim.session_id,
    profileId: scope.profileId,
    chatId: scope.chatId,
  });
  const cached =
    original ??
    (await nativeNoteFile(service, files, {
      profileId: scope.profileId,
      sessionId: claim.session_id,
      chatId: scope.chatId,
      authorize: scope.authorize,
      image,
      data,
    }));
  scope.authorize();
  const text = await files.ensureMediaNote(cached);
  scope.authorize();
  return `[Native image ${image.attachmentId}${image.name === undefined ? '' : `: ${image.name}`} (${image.mediaType})${original === undefined ? '' : `; original attachment: ${original.id}; use read_assistant_attachment for explicit inspection`}]\n${text}`;
}

function originalImage(
  service: HarnessService,
  retained: RetainedImage,
  input: { readonly sessionId: string; readonly profileId: string; readonly chatId: string },
): StoredAttachment | undefined {
  const image = retained.image.attachment;
  return (
    explicitNativeOriginal(service, {
      ...input,
      event: retained.event,
      originalId: retained.image.original_attachment_id,
    }) ??
    service.store.assistantChat
      .attachmentsOfChat(input.chatId)
      .find(
        (file) =>
          file.profile_id === input.profileId &&
          file.sha256 === image.attachmentId.slice(7) &&
          file.bytes === image.bytes &&
          file.mime === image.mediaType,
      )
  );
}

function retainedImage(
  service: HarnessService,
  session: string,
  profile: string,
  input: Input,
): RetainedImage {
  const event = service.store.dshSessions.read(
    { session_id: session, offset: input.seq, limit: 1 },
    profile,
  ).events[0];
  if (event?.seq !== input.seq || (event.type !== 'user/message' && event.type !== 'tool/result'))
    throw new ApiError(
      'forbidden',
      'Native image does not belong to a retained input or tool result.',
    );
  const content = CONTENT.parse(
    event.type === 'user/message'
      ? event.data
      : z.object({ message: CONTENT }).parse(event.data).message,
  );
  const images = content.content
    .map((block) => IMAGE.safeParse(block))
    .filter((block) => block.success);
  const image = images[input.image_index];
  if (image?.success !== true || image.data.attachment.attachmentId !== input.attachment_id)
    throw new ApiError(
      'forbidden',
      'Native image occurrence differs from the exact retained conversation event.',
    );
  return { image: image.data, event };
}

async function nativeNoteFile(
  service: HarnessService,
  files: AssistantFiles,
  input: {
    readonly profileId: string;
    readonly sessionId: string;
    readonly chatId: string;
    readonly authorize: () => void;
    readonly image: z.infer<typeof IMAGE>['attachment'];
    readonly data: Buffer;
  },
): Promise<StoredAttachment> {
  const hex = createHash('sha256')
    .update(JSON.stringify([input.profileId, input.sessionId, input.image.attachmentId]))
    .digest('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  try {
    const file = service.store.assistantChat.attachment(id);
    if (file.profile_id !== input.profileId || file.sha256 !== input.image.attachmentId.slice(7))
      throw new ApiError(
        'conflict',
        'Native media cache identity differs from its initiating profile and bytes.',
      );
    return file;
  } catch (cause) {
    if (!(cause instanceof StoreNotFoundError)) throw cause;
    return files.keepBytes({
      id,
      chatId: input.chatId,
      authorize: input.authorize,
      profileId: input.profileId,
      name: input.image.name ?? 'native-image',
      mime: input.image.mediaType,
      content: input.data,
      signal: AbortSignal.timeout(90_000),
    });
  }
}
