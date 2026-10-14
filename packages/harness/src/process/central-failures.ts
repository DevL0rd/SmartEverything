import { centralCallKey } from './central-call-key';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { JsonValue } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
interface CentralFailure {
  readonly response: Record<string, JsonValue>;
  readonly message: string;
}
export class CentralToolFailures {
  private readonly failures = new Map<string, CentralFailure>();
  install(ctx: Context): void {
    ctx.on('tools/execute', async (execution, next) => {
      const result = await next();
      const failure = this.failures.get(centralCallKey(execution));
      if (failure === undefined || !result.isError || result.error.message !== failure.message)
        return result;
      return {
        ...result,
        content: [{ type: 'text', text: JSON.stringify(failure.response) }],
        meta: z.json().parse({
          central_response: failure.response,
          ...(result.meta === undefined ? {} : { native_meta: result.meta }),
        }),
      };
    });
    ctx.on('tools/result', (execution) => {
      this.failures.delete(centralCallKey(execution));
    });
    ctx.effect(() => (): void => {
      this.failures.clear();
    });
  }
  capture(execution: ToolRunContext, response: Record<string, JsonValue>): void {
    const message = response['error'];
    if (typeof message !== 'string') return;
    this.failures.set(centralCallKey(execution), { response, message });
    throw new HarnessRuntimeError('operation_failed', message);
  }
}
