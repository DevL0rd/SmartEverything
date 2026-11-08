import type { AppUpdateChannel, AppUpdateNotice, AppUpdatePlatform } from '@smarteverything/domain';

export interface NoticeTarget {
  readonly platform: AppUpdatePlatform;
  readonly channel: AppUpdateChannel;
  readonly runtimeVersion: string | null;
}

export function noticeMatches(notice: AppUpdateNotice, target: NoticeTarget): boolean {
  return (
    notice.platform === target.platform &&
    notice.channel === target.channel &&
    (target.runtimeVersion === null || notice.runtimeVersion === target.runtimeVersion)
  );
}
