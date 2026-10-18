import { Logger } from '@smarteverything/logging';

const log = new Logger('app.talk');

export function trackTalk<T>(
  event: string,
  payload: Readonly<Record<string, unknown>>,
  work: () => Promise<T>,
): Promise<T> {
  const operation = log.operation(event, payload);
  return work().then(
    (result) => {
      operation.succeeded();
      return result;
    },
    (error: unknown) => {
      operation.failed(error);
      throw error;
    },
  );
}

export { log as talkLog };
