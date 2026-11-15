import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { joinParts } from '../../format/text';
import { shellSearchOf, type BrowserHeader } from '../files';
import { useComputerReach } from './data/computer-scopes';
import { ComputerFrame, type ComputerFrameProps } from './components/computer-frame';
import { SectionGate } from './processes/section-gate';
import { ComputerBrowser, type ComputerFrameSlots } from './browser/computer-browser';

type FrameHead = Omit<ComputerFrameProps, 'deviceId' | 'children'>;

function frameHeadOf(header: BrowserHeader | null, name: string): FrameHead {
  if (header === null) return { title: 'Files', subtitle: name };
  return {
    title: header.title,
    subtitle: joinParts([name, header.subtitle ?? null]),
    actions: header.actions,
    ...(header.primary === undefined ? {} : { primary: header.primary }),
    ...(header.search === null ? {} : { search: shellSearchOf(header.search) }),
  };
}

function FilesFrame({
  deviceId,
  slots,
}: {
  readonly deviceId: string;
  readonly slots: ComputerFrameSlots;
}): ReactNode {
  const { name } = useComputerReach(deviceId);
  return (
    <ComputerFrame
      deviceId={deviceId}
      width="dashboard"
      scroll={false}
      iconRail={slots.detailsOpen}
      {...frameHeadOf(slots.header, name)}
    >
      <SectionGate deviceId={deviceId} section="files" scope="files">
        {slots.children}
      </SectionGate>
    </ComputerFrame>
  );
}

export function ComputerFilesScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <ComputerBrowser
      deviceId={deviceId}
      hrefOf={(path) => href.settings.device(deviceId, 'files', { path })}
      renderFrame={(slots) => <FilesFrame deviceId={deviceId} slots={slots} />}
    />
  );
}
