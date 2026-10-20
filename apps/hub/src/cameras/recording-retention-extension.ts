import type { Clock } from '../clock';
import type { RunningExtension, ServerExtension } from '../extensions';
import { recordingPathIn } from '../services';
import { RecordingRetention } from './recording-retention';

export function recordingRetentionExtension(clock: Clock): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const retention = new RecordingRetention({
      store: context.store,
      recordingPath: recordingPathIn(context.dataDirectory),
      clock,
      log: context.log,
    });
    retention.start();
    return Promise.resolve({
      endpoints: {},
      routes: [],
      stop: (): Promise<void> => {
        retention.stop();
        return Promise.resolve();
      },
    });
  };
}
