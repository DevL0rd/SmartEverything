import type { Agent } from '@deepseek-ai/dsh-agent';
import { ProjectFileSystem } from './project-filesystem';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment';
import { FsError } from '@deepseek-ai/dsh-fs';
import { z } from 'zod';
import { basename, extname } from 'node:path';
const PATH = z.object({ file_path: z.string().min(1) });
const definitions = new WeakSet<ToolDefinition>();
export function managedImageDefinition(definition: ToolDefinition | undefined): boolean {
  return definition !== undefined && definitions.has(definition);
}
export function installManagedImage(ctx: Context, registration: Context): void {
  const original = ctx.tools.get('read_image');
  if (original === undefined) throw new FsError('Native image tool is unavailable.', 'FS_IO_ERROR');
  const definition: ToolDefinition = {
    ...original,
    execute: (raw, execution) =>
      managedImageCall(ctx)
        ? readManagedImage(ctx, raw, execution)
        : original.execute(raw, execution),
  };
  definitions.add(definition);
  registration.tools.register(definition);
}
function managedImageCall(ctx: Context): boolean {
  return ctx.fs instanceof ProjectFileSystem && ctx.fs.scopes.current()?.binding.kind === 'managed';
}
async function readManagedImage(
  ctx: Context,
  raw: unknown,
  execution: ToolRunContext,
): Promise<unknown> {
  const { file_path } = PATH.parse(raw);
  const agent = execution.agent;
  if (agent === undefined)
    throw new FsError('Managed images require an owned session.', 'FS_PERMISSION_DENIED');
  await imageRoute(ctx, execution);
  await ctx.workingDirectory.ensure(agent, execution.signal);
  const target = await ctx.fs.resolve(file_path, { signal: execution.signal });
  const info = await ctx.fs.stat(target, execution.signal);
  if (info?.type !== 'file')
    throw new FsError('Managed image requires a regular file.', 'FS_NOT_REGULAR_FILE');
  const data = await ctx.fs.readBytes(
    target,
    execution.signal,
    Math.min(
      ctx.attachments.imageLimits.maxImageBytes,
      ctx.attachments.imageLimits.maxMessageImageBytes,
    ),
  );
  const image = await ctx.attachments.saveImage({
    data,
    mediaType: mediaType(data, file_path),
    name: basename(target.displayPath),
  });
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, execution);
  return { path: target.displayPath, image };
}
async function imageRoute(ctx: Context, execution: ToolRunContext): Promise<void> {
  const agent = execution.agent;
  if (agent === undefined)
    throw new FsError('Managed images require a native agent.', 'FS_PERMISSION_DENIED');
  const { provider, model } = imageSelection(agent);
  if (provider === undefined || model === undefined)
    throw new FsError('The current image model route is unavailable.', 'FS_IO_ERROR');
  const active = await ctx.llm.resolveModelInfo(provider, model, execution.signal);
  if (active.inputModalities?.includes('image') !== true)
    throw new FsError('The current model route does not accept images.', 'FS_NOT_TEXT');
}
function imageSelection(agent: Agent): {
  readonly provider: string | undefined;
  readonly model: string | undefined;
} {
  const routed = agent.session.requestHeader()?.config;
  return {
    provider: routed?.provider ?? agent.options.provider,
    model: routed?.model ?? agent.options.model,
  };
}
const EXTENSIONS: Readonly<Record<string, ImageMediaType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
function mediaType(bytes: Uint8Array, path: string): ImageMediaType {
  const extension = extname(path).toLowerCase();
  const declared = EXTENSIONS[extension];
  if (declared !== undefined) return declared;
  if (extension !== '')
    throw new FsError('Managed images support PNG, JPEG, GIF and WebP.', 'FS_NOT_TEXT');
  const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8')) return 'image/jpeg';
  if (hex.startsWith('474946')) return 'image/gif';
  if (hex.endsWith('57454250')) return 'image/webp';
  throw new FsError('Managed file has no supported image signature.', 'FS_NOT_TEXT');
}
