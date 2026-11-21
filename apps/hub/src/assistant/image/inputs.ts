import { readFile } from 'node:fs/promises';
import { ApiError, type ImageResolvedInput } from '@smarteverything/domain';
import type { ImageActor, ImageServiceOptions } from './contract';
import { readImage, type ImageBytes } from './media';
import type { ResolvedImage } from './reserve-unit';
export async function ownedChat(
  options: ImageServiceOptions,
  actor: ImageActor,
  chatId: string,
): Promise<void> {
  await actor.authorize('read', chatId);
  const chat = await options.store.host.call('aiChats', 'chat', chatId);
  if (chat.profile_id !== actor.profileId)
    throw new ApiError('forbidden', 'This image chat belongs to another profile.');
}
export function readInputs(
  options: ImageServiceOptions,
  inputs: readonly ResolvedImage[],
  signal: AbortSignal,
): Promise<readonly { readonly identity: ImageResolvedInput; readonly image: ImageBytes }[]> {
  return Promise.all(
    inputs.map(async (input) => ({
      identity: input.identity,
      image: await readImage(await readFile(options.files.pathOf(input.file), { signal })),
    })),
  );
}
