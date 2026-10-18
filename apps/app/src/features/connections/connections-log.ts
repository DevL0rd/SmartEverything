import { Logger } from '@smarteverything/logging';

export const connectionsLog = new Logger('app.connections');

export function trackConnection<T>(
  event: string,
  payload: Readonly<Record<string, unknown>>,
  work: () => Promise<T>,
): Promise<T> {
  const operation = connectionsLog.operation(event, payload);
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
