import type { ReactNode } from 'react';
import type { FileEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ReasonLine } from '../../../components/reason-line';
import { isNative } from '../../../design/platform';
import { SearchBar } from './file-search';
import { FileToolbar } from './file-toolbar';
import { parentOf, sourceWord } from './file-model';
import { breadcrumbs } from './path-model';
import { PlacesBar } from './places-bar';
import { SelectionBar } from './selection-bar';
import type { Browse } from './use-browse';
import type { Downloads } from './use-downloads';
import type { FileActions } from './use-file-actions';
import type { Selection } from './use-selection';
import type { Uploads } from './use-uploads';

function Picked({
  selection,
  entries,
  actions,
  downloads,
  disabled,
}: {
  readonly selection: Selection;
  readonly entries: readonly FileEntry[];
  readonly actions: FileActions;
  readonly downloads: Downloads;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <SelectionBar
      count={selection.entries.length}
      total={entries.length}
      disabled={disabled}
      onDownload={() => {
        downloads.flow.start(selection.entries);
        selection.clear();
      }}
      onMove={() => {
        actions.show({ kind: 'transfer', entries: selection.entries, mode: 'move' });
        selection.clear();
      }}
      onCopy={() => {
        actions.show({ kind: 'transfer', entries: selection.entries, mode: 'copy' });
        selection.clear();
      }}
      onSelectAll={() => {
        selection.selectAll(entries);
      }}
      onTrash={() => {
        background(
          actions.ops.run({ action: 'trash', paths: [...selection.paths] }),
          'files.trash_failed',
        );
        selection.clear();
      }}
      onClear={selection.clear}
    />
  );
}

function Folder({
  browse,
  actions,
  uploads,
  go,
  wide,
  disabled,
}: {
  readonly browse: Browse;
  readonly actions: FileActions;
  readonly uploads: Uploads;
  readonly go: (path: string) => void;
  readonly wide: boolean;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <FileToolbar
      crumbs={breadcrumbs(browse.here, browse.home)}
      canGoUp={browse.here !== '/'}
      sourceWord={sourceWord(isNative())}
      wide={wide}
      searching={browse.searchOpen}
      showHidden={browse.showHidden}
      disabled={disabled}
      onGo={go}
      onUp={() => {
        go(parentOf(browse.here));
      }}
      onSearch={browse.toggleSearch}
      onHidden={browse.toggleHidden}
      onNewFolder={() => {
        actions.show({ kind: 'folder' });
      }}
      onUpload={() => {
        uploads.setOpen(true);
      }}
      onEnterPath={() => {
        actions.show({ kind: 'path' });
      }}
    />
  );
}

function OfflineLine({
  online,
  name,
}: {
  readonly online: boolean;
  readonly name: string;
}): ReactNode {
  return online ? null : (
    <ReasonLine
      icon="wifiOff"
      tone="warning"
      text={`${name} is offline. Files come back when it is.`}
    />
  );
}

export function Top({
  browse,
  actions,
  uploads,
  selection,
  downloads,
  go,
  wide,
  online,
  name,
}: {
  readonly browse: Browse;
  readonly actions: FileActions;
  readonly uploads: Uploads;
  readonly selection: Selection;
  readonly downloads: Downloads;
  readonly go: (path: string) => void;
  readonly wide: boolean;
  readonly online: boolean;
  readonly name: string;
}): ReactNode {
  return (
    <>
      <OfflineLine online={online} name={name} />
      {selection.active ? (
        <Picked
          selection={selection}
          entries={browse.entries}
          actions={actions}
          downloads={downloads}
          disabled={!online}
        />
      ) : null}
      <Folder
        browse={browse}
        actions={actions}
        uploads={uploads}
        go={go}
        wide={wide}
        disabled={!online}
      />
      {browse.places === undefined ? null : (
        <PlacesBar places={browse.places} here={browse.here} onGo={go} />
      )}
      {browse.searchOpen ? (
        <SearchBar value={browse.query} onChange={browse.setQuery} search={browse.search} />
      ) : null}
    </>
  );
}
