import type { ReactNode } from 'react';
import type { DriveRoot } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useSectionParam } from '../../../components/use-section-param';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useIsOwner } from '../../../store/selectors';
import { useDriveRoots } from '../../nas/data';
import { rootCardOf } from '../roots/root-card-model';
import { AddRootSheet } from './add-root-sheet';
import { DriveSettingsSection } from './page';
import { DRIVE_SETTINGS_PAGE } from './sections';

export const ADD_ROOT_PARAM = 'sheet';

export const ADD_ROOT_SHEET = 'add-folder';

export function addRootHref(): AppHref {
  return {
    pathname: '/settings/[...page]',
    params: { page: DRIVE_SETTINGS_PAGE.split('/'), [ADD_ROOT_PARAM]: ADD_ROOT_SHEET },
  };
}

export function rootSettingsHref(rootId: string): AppHref {
  return href.settings.page(`${DRIVE_SETTINGS_PAGE}/roots/${rootId}`);
}

export function libraryRootsOf(roots: readonly DriveRoot[]): readonly DriveRoot[] {
  return roots.filter((root) => root.scope === 'home');
}

export function rootLineOf(root: DriveRoot): string {
  const model = rootCardOf(root, null, []);
  return joinParts([
    bytes(root.bytes),
    model.items,
    model.state.tone === 'positive' ? null : model.state.text,
  ]);
}

function RootRow({
  root,
  owner,
}: {
  readonly root: DriveRoot;
  readonly owner: boolean;
}): ReactNode {
  const model = rootCardOf(root, null, []);
  return (
    <ListRow
      title={root.label}
      subtitle={model.subtitle}
      caption={rootLineOf(root)}
      icon={model.glyph}
      value={root.readOnly ? 'Can view' : 'Can edit'}
      {...(owner ? { href: rootSettingsHref(root.id), chevron: true } : {})}
    />
  );
}

function NoRoots({
  owner,
  onAdd,
}: {
  readonly owner: boolean;
  readonly onAdd: () => void;
}): ReactNode {
  return (
    <EmptyState
      compact
      icon="folder"
      title="No library folders yet"
      body={
        owner
          ? 'Add a folder or a disk on the hub to bring its files into Drive.'
          : 'The owner of the home adds folders and disks to the library.'
      }
      {...(owner
        ? { action: <Button label="Add a folder or drive" icon="plus" onPress={onAdd} /> }
        : {})}
    />
  );
}

function RootList({
  roots,
  owner,
  onAdd,
}: {
  readonly roots: readonly DriveRoot[];
  readonly owner: boolean;
  readonly onAdd: () => void;
}): ReactNode {
  return (
    <List
      inset
      footer="Files stay where they are on the disk. Drive watches each folder and picks up changes made outside it."
    >
      {roots.map((root) => (
        <RootRow key={root.id} root={root} owner={owner} />
      ))}
      {owner ? <ListRow title="Add a folder or drive" icon="plus" onPress={onAdd} /> : null}
    </List>
  );
}

export function RootsSection(): ReactNode {
  const roots = libraryRootsOf(useDriveRoots());
  const owner = useIsOwner();
  const [sheet, setSheet, clearSheet] = useSectionParam(ADD_ROOT_PARAM);
  const add = (): void => {
    setSheet(ADD_ROOT_SHEET);
  };
  return (
    <DriveSettingsSection section="roots">
      {roots.length === 0 ? (
        <NoRoots owner={owner} onAdd={add} />
      ) : (
        <RootList roots={roots} owner={owner} onAdd={add} />
      )}
      {owner ? <AddRootSheet open={sheet === ADD_ROOT_SHEET} onClose={clearSheet} /> : null}
    </DriveSettingsSection>
  );
}
