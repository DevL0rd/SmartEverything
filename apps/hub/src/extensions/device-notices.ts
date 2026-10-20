import type { DeviceNoticePushData } from '@smarteverything/domain';
import { Listeners } from '../listeners';

export interface DeviceNotice {
  readonly title: string;
  readonly body: string;
  readonly data: DeviceNoticePushData;
}

export class DeviceNotices {
  private readonly notices = new Listeners<DeviceNotice>();

  raise(notice: DeviceNotice): void {
    this.notices.emit(notice);
  }

  listen(listener: (notice: DeviceNotice) => void): () => void {
    return this.notices.listen(listener);
  }
}
