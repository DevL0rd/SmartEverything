import { dialog, shell, type WebContents } from 'electron';
import {
  NATIVE_HUB_RESOURCE_DOWNLOAD,
  NATIVE_HUB_RESOURCE_ID,
  NATIVE_HUB_RESOURCE_OPEN,
  type NativeHubResource,
  type NativeHubResourceDownloadResult,
} from '@smarteverything/domain';
import { HubResourceBroker } from '../../../hub/src/client-network/resource-broker';
import { HubResourceDownloads } from '../../../hub/src/client-network/resource-download';
import type { DesktopRouteAuthority } from './authority.js';
import { HubTransportError } from './policy.js';
import { originOf } from '../origin.js';

export class DesktopHubResources {
  readonly broker: HubResourceBroker;
  private readonly downloads: HubResourceDownloads;
  constructor(authority: DesktopRouteAuthority, startUrl: string) {
    const origin = originOf(startUrl);
    if (origin === undefined) throw new HubTransportError('Media requires an exact app origin');
    const policies = {
      lease: authority.resourceLease.bind(authority),
      failed: authority.failed.bind(authority),
    };
    this.broker = new HubResourceBroker(policies, origin);
    this.downloads = new HubResourceDownloads(policies);
  }
  open(owner: WebContents, value: unknown): NativeHubResource {
    return this.broker.open(owner.id, NATIVE_HUB_RESOURCE_OPEN.parse(value));
  }
  release(owner: WebContents, value: unknown): void {
    this.broker.release(owner.id, NATIVE_HUB_RESOURCE_ID.parse(value));
  }
  async download(owner: WebContents, value: unknown): Promise<NativeHubResourceDownloadResult> {
    const input = NATIVE_HUB_RESOURCE_DOWNLOAD.parse(value);
    const admission = this.broker.admit(owner.id, input.id);
    if (input.intent === 'save') {
      const selection = await dialog.showSaveDialog({ title: 'Save media' });
      admission.signal.throwIfAborted();
      if (selection.canceled) return 'cancelled';
      await this.downloads.write(admission, selection.filePath);
      return 'completed';
    }
    const file = await this.downloads.write(admission);
    admission.signal.throwIfAborted();
    const error = await shell.openPath(file);
    if (error !== '')
      throw new HubTransportError('Native media player could not open the downloaded file');
    return 'completed';
  }
}
