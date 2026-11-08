import { JSON_VALUE } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { effectFailure } from '../effect-failure';
import type { EffectHandler } from './effect-run';

export const DEBUG_LOG_MESSAGE_LIMIT = 2_000;
export const DEBUG_LOG_DATA_LIMIT = 4_000;

export const DEBUG_LOG_EVENT = 'automation.debug_logged';

const DEBUG_LOG_PARAMS = z.object({
  message: z.string(),
  data: JSON_VALUE.optional(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
});

type Sink = Pick<Logger, 'info' | 'warn' | 'error'>;

function dataFields(data: z.infer<typeof JSON_VALUE> | undefined): Record<string, unknown> {
  if (data === undefined) return {};
  const size = JSON.stringify(data).length;
  if (size > DEBUG_LOG_DATA_LIMIT) return { dataOmitted: true, dataSize: size };
  return { data };
}

function messageFields(message: string): Record<string, unknown> {
  if (message.length <= DEBUG_LOG_MESSAGE_LIMIT) return { message };
  return {
    message: message.slice(0, DEBUG_LOG_MESSAGE_LIMIT),
    messageTruncated: true,
    messageSize: message.length,
  };
}

export function debugLogHandler(log: Sink): EffectHandler {
  return (params, request, run) => {
    const checked = DEBUG_LOG_PARAMS.safeParse(params);
    if (!checked.success) {
      return Promise.resolve({
        ok: false,
        class: 'Invalid',
        message: z.prettifyError(checked.error),
      });
    }
    const { level, message, data } = checked.data;
    try {
      const payload = {
        runId: run.runId,
        automationId: run.automationId,
        nodeId: request.node.id,
        nodeKey: request.node.key,
        ...messageFields(message),
        ...dataFields(data),
      };
      if (level === 'error') log.error(DEBUG_LOG_EVENT, undefined, payload);
      else log[level](DEBUG_LOG_EVENT, payload);
      return Promise.resolve({ ok: true, value: {} });
    } catch (cause) {
      return Promise.resolve(effectFailure(cause));
    }
  };
}
