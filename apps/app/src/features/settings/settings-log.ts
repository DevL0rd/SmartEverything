import { Logger } from '@smarteverything/logging';

export const settingsLog = new Logger('app.settings');

export function trackSetting<T>(
  event: string,
  payload: Readonly<Record<string, unknown>>,
  work: () => Promise<T>,
): Promise<T> {
  const operation = settingsLog.operation(event, payload);
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
