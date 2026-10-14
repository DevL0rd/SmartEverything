import { Logger } from '@smarteverything/logging';
const log = new Logger('app.browser-tabs');
export function browserTabOperation(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    log.error('tab.operation_failed', error);
  });
}
