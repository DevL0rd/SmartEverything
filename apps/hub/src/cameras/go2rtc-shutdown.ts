import type { Logger } from '@smarteverything/logging';
import type { Go2rtcSupervisor } from './go2rtc-supervisor';

export async function stopGo2rtcForShutdown(
  supervisor: Pick<Go2rtcSupervisor, 'isRunning' | 'stop'>,
  log: Logger,
): Promise<void> {
  if (!supervisor.isRunning()) {
    return;
  }
  await supervisor.stop().catch((cause: unknown) => {
    log.error('go2rtc.stop_failed', cause);
  });
}
