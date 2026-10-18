import { useState } from 'react';
import { prepareComputerDownload, type PreparedDownload } from '../../../api/computer-downloads';
import { cancelNativeMediaFile } from '../../../api/connection/media-resources';
import { useValue } from '../../../design/external-store';
import { openFile, saveFile, shareFileLink } from '../../../platform/file-actions';
import { DownloadFlow, type DownloadOutcome, type DownloadState } from './download-flow';

export interface Downloads {
  readonly state: DownloadState;
  readonly flow: DownloadFlow;
}

export function useDownloads(deviceId: string): Downloads {
  const [flow] = useState(
    () =>
      new DownloadFlow({
        prepare: (paths): Promise<PreparedDownload> => prepareComputerDownload(deviceId, paths),
        perform: (intent, { url, download }): Promise<DownloadOutcome> => {
          if (intent === 'save') return saveFile(url);
          return intent === 'open' ? openFile(url) : shareFileLink(url, download.name);
        },
        abort: ({ url }): Promise<void> => cancelNativeMediaFile(url),
      }),
  );
  return { state: useValue(flow.state), flow };
}
