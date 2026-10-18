import type { LineSubscriber, StopStream } from './line-stream';

const DRM_EVENT = /^UDEV\s+\[[^\]]+\]\s+(add|remove|change)\s+\S+\s+\(drm\)/;

export function watchDrm(
  lines: LineSubscriber,
  onChange: () => void,
  onFailure: (cause: unknown) => void,
): StopStream {
  return lines({
    program: 'udevadm',
    args: ['monitor', '--udev', '--subsystem-match=drm'],
    onLine: (line): void => {
      if (DRM_EVENT.test(line)) {
        onChange();
      }
    },
    onFailure,
  });
}
