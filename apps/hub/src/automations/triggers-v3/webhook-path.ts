import type { JsonValue } from '@smarteverything/domain';

export const WEBHOOK_TRIGGER_KIND = 'trigger.webhook';

const SECRET_PATH = /^[A-Za-z0-9_-]{16,128}$/;

export function webhookPathProblem(ports: Readonly<Record<string, JsonValue>>): string | null {
  const path = ports['path'];
  return typeof path === 'string' && SECRET_PATH.test(path)
    ? null
    : 'path is the secret of the webhook: use 16 to 128 letters, digits, dashes or underscores';
}
