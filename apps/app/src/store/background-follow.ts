import { Logger, background } from '@smarteverything/logging';

const log = new Logger('app.background-link');

export interface BackgroundLinkControl {
  readonly start: () => void;
  readonly stop: () => void;
}

export interface BackgroundFollowPorts {
  readonly current: () => string;
  readonly onChange: (listener: (state: string) => void) => () => void;
  readonly alertsAllowed: () => Promise<boolean>;
}

export function followBackground(
  link: BackgroundLinkControl,
  ports: BackgroundFollowPorts,
): () => void {
  let following = true;
  const begin = async (): Promise<void> => {
    const allowed = await ports.alertsAllowed();
    if (!following || ports.current() !== 'background') return;
    if (!allowed) {
      log.info('background.alerts_off');
      return;
    }
    link.start();
  };
  const apply = (state: string): void => {
    if (state === 'active') link.stop();
    else if (state === 'background') background(begin(), 'background.permission_unreadable');
  };
  apply(ports.current());
  const stopListening = ports.onChange(apply);
  return (): void => {
    following = false;
    stopListening();
    link.stop();
  };
}
