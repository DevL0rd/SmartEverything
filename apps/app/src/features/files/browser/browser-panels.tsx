import { useEffect, useState, type ReactNode } from 'react';
import { cancelNativeMediaFile } from '../../../api/connection/media-resources';
import { openFile, saveFile, shareFileLink } from '../../../platform/file-actions';
import { DetailsPane } from '../details/details-pane';
import type { DetailsHost } from '../details/details-host';
import { QuickLook } from '../quick-look/quick-look';
import { DownloadFlow, type DownloadIntent, type DownloadOutcome } from '../transfer/download-flow';
import { DownloadSheet } from '../transfer/download-sheet';
import { freeNameOf } from '../transfer/name-model';
import { NameSheet } from '../transfer/name-sheet';
import { TransferSheet } from '../transfer/transfer-sheet';
import { UploadSheet } from '../transfer/upload-sheet';
import { UploadStrip } from '../transfer/upload-strip';
import {
  locationKeyOf,
  type FileLocation,
  type FileNode,
  type FileSource,
  type PreparedDownload,
} from '../source/types';
import { uploadQueueOf } from './browser-commands';
import type { BrowserSlots } from './file-browser';
import type { FileBrowserHandle } from './browser-types';
import { PathSheet } from './path-sheet';

export const NEW_FOLDER_NAME = 'New folder';

export interface PanelsInput {
  readonly from: string;
  readonly top?: ReactNode;
}

function takenOf<O>(browser: FileBrowserHandle<O>, except: string | null): ReadonlySet<string> {
  return new Set(
    browser.listing.entries.filter((node) => node.key !== except).map((node) => node.name),
  );
}

function detailsHostOf<O>(browser: FileBrowserHandle<O>): DetailsHost<O> {
  const { commands, abilities } = browser;
  return {
    source: browser.source,
    abilities,
    act: (action, nodes): void => {
      commands.run({ kind: action, nodes });
    },
    quickLook:
      abilities.quickLook.length === 0
        ? null
        : (node): void => {
            commands.focus(node);
            commands.setPanel('details', false);
            commands.setPanel('quickLook', true);
          },
    close: (): void => {
      commands.setPanel('details', false);
    },
  };
}

function Details<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  return <DetailsPane node={browser.focused} host={detailsHostOf(browser)} />;
}

function Look<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { commands, abilities } = browser;
  return (
    <QuickLook
      target={{
        source: browser.source,
        abilities,
        nodes: browser.visible,
        focused: browser.focused,
        close: () => {
          commands.setPanel('quickLook', false);
        },
        focus: commands.focus,
        details: abilities.details
          ? (node: FileNode<O>): void => {
              commands.focus(node);
              commands.setPanel('quickLook', false);
              commands.setPanel('details', true);
            }
          : null,
      }}
    />
  );
}

function folderNameOf<O>(browser: FileBrowserHandle<O>): string {
  return browser.header.title;
}

interface SheetProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly close: () => void;
}

function RenameSheet<O>({
  browser,
  node,
  close,
}: SheetProps<O> & { readonly node: FileNode<O> }): ReactNode {
  return (
    <NameSheet
      title={`Rename ${node.name}`}
      label="Name"
      initial={node.name}
      current={node.name}
      helper={`In ${folderNameOf(browser)}`}
      confirmLabel="Rename"
      taken={takenOf(browser, node.key)}
      onSubmit={(name) => {
        browser.commands.run({ kind: 'rename', node, name });
      }}
      onClose={close}
    />
  );
}

function NewFolderSheet<O>({
  browser,
  where,
  close,
}: SheetProps<O> & { readonly where: FileLocation }): ReactNode {
  const taken = takenOf(browser, null);
  return (
    <NameSheet
      title="New folder"
      label="Folder name"
      initial={freeNameOf(NEW_FOLDER_NAME, taken)}
      current={null}
      helper={`In ${folderNameOf(browser)}`}
      confirmLabel="Make folder"
      taken={taken}
      onSubmit={(name) => {
        browser.commands.run({ kind: 'new_folder', in: where, name });
      }}
      onClose={close}
    />
  );
}

function Pending<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { pending, commands } = browser;
  const close = (): void => {
    commands.setPending(null);
  };
  if (pending === null) return null;
  switch (pending.kind) {
    case 'rename':
      return <RenameSheet browser={browser} node={pending.node} close={close} />;
    case 'newFolder':
      return <NewFolderSheet browser={browser} where={pending.in} close={close} />;
    case 'move':
    case 'copy':
      return (
        <TransferSheet
          source={browser.source}
          mode={pending.kind}
          nodes={pending.nodes}
          start={browser.location}
          onRun={commands.run}
          onClose={close}
        />
      );
    case 'enterPath':
      return <PathSheet browser={browser} onClose={close} />;
    case 'download':
      return null;
  }
}

class DownloadAsk<O> {
  private source: FileSource<O>;
  private nodes: readonly FileNode<O>[] = [];

  constructor(source: FileSource<O>) {
    this.source = source;
  }

  ask(source: FileSource<O>, nodes: readonly FileNode<O>[]): void {
    this.source = source;
    this.nodes = nodes;
  }

  prepare(): Promise<PreparedDownload> {
    return this.source.download(this.nodes);
  }
}

function performDownload(
  intent: DownloadIntent,
  { url, download }: PreparedDownload,
): Promise<DownloadOutcome> {
  if (intent === 'save') return saveFile(url);
  return intent === 'open' ? openFile(url) : shareFileLink(url, download.name);
}

interface Downloads<O> {
  readonly ask: DownloadAsk<O>;
  readonly flow: DownloadFlow;
}

function downloadsOf<O>(source: FileSource<O>): Downloads<O> {
  const ask = new DownloadAsk(source);
  const flow = new DownloadFlow({
    prepare: (): Promise<PreparedDownload> => ask.prepare(),
    perform: performDownload,
    abort: ({ url }): Promise<void> => cancelNativeMediaFile(url),
  });
  return { ask, flow };
}

function useDownloads<O>(browser: FileBrowserHandle<O>): DownloadFlow {
  const { source, pending, commands } = browser;
  const [{ ask, flow }] = useState(() => downloadsOf(source));
  const asked = pending?.kind === 'download' ? pending.nodes : null;
  const { setPending } = commands;
  useEffect(() => {
    if (asked === null) return;
    ask.ask(source, asked);
    flow.start(asked);
    setPending(null);
  }, [asked, ask, flow, setPending, source]);
  return flow;
}

function Uploads<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const queue = uploadQueueOf(browser.source);
  const folderKey = locationKeyOf(browser.location);
  const folder = folderNameOf(browser);
  return (
    <>
      <UploadStrip
        queue={queue}
        folderKey={folderKey}
        folder={folder}
        resume={browser.abilities.uploadResume}
        onConflicts={() => {
          setChoosing(true);
        }}
      />
      <UploadSheet
        queue={queue}
        folderKey={folderKey}
        folder={folder}
        open={choosing}
        onPick={browser.commands.upload}
        onClose={() => {
          setChoosing(false);
        }}
      />
    </>
  );
}

export function useBrowserPanels<O>(
  browser: FileBrowserHandle<O>,
  input: PanelsInput,
): BrowserSlots {
  const flow = useDownloads(browser);
  return {
    ...(input.top === undefined ? {} : { top: input.top }),
    strip: <Uploads browser={browser} />,
    details: <Details browser={browser} />,
    quickLook: <Look browser={browser} />,
    sheets: (
      <>
        <Pending browser={browser} />
        <DownloadSheet flow={flow} from={input.from} />
      </>
    ),
  };
}
