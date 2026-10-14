import {
  COMPUTER_RUNTIME_REPLY,
  type ComputerRuntimeTarget,
  type ComputerRuntimeRequest,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
export async function runtimeValue<T>(
  directory: ComputerAiDirectory,
  target: ComputerRuntimeTarget,
  request: ComputerRuntimeRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  if (request.runtime === 'claude')
    return directory.request(target.device_id, request.request, schema);
  const result = await directory.requestRuntime(target, request, COMPUTER_RUNTIME_REPLY);
  return schema.parse(result.reply.value);
}
