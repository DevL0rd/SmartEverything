import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { NAV_TITLE_MAX, type NavIcon } from '@smarteverything/domain';
import { Button } from '../components/button';
import { DialogFrame } from '../components/dialog-frame';
import { Text } from '../components/text';
import { TextField } from '../components/text-field';
import { useValue } from '../design/external-store';
import { useNavEdits } from './nav-edit-actions';
import { FOLDER_ICON, navEditor, type NavEditor } from './nav-edit-state';
import { NavIconChoices } from './nav-icon-choices';
import type { NavModel } from './nav-model';
import { navRows, type NavRow } from './nav-rows';
import { navShown } from './nav-sheet-state';

function closeEditor(): void {
  navEditor.set(null);
}

function rowOf(model: NavModel | null, key: string): NavRow | undefined {
  return model === null ? undefined : navRows(model.nodes, true).find((row) => row.key === key);
}

function faceOf(row: NavRow): { readonly title: string; readonly pin: boolean } {
  return row.kind === 'folder'
    ? { title: row.folder.title, pin: false }
    : { title: row.entry.title, pin: row.entry.kind === 'pin' };
}

function nameError(value: string): string | null {
  return value.trim().length > NAV_TITLE_MAX
    ? `Use at most ${String(NAV_TITLE_MAX)} characters`
    : null;
}

function RenameDialog({ row }: { readonly row: NavRow }): ReactNode {
  const edits = useNavEdits();
  const face = faceOf(row);
  const [value, setValue] = useState(face.title);
  const error = nameError(value);
  const blocked = value.trim().length === 0 || error !== null;
  const save = (): void => {
    if (blocked) return;
    edits.rename(row.key, value.trim());
    closeEditor();
  };
  return (
    <DialogFrame
      open
      onClose={closeEditor}
      label={`Rename ${face.title}`}
      title="Rename"
      kind="dialog"
      footer={
        <>
          {face.pin ? (
            <Button
              label="Use original name"
              variant="text"
              onPress={() => {
                edits.rename(row.key, null);
                closeEditor();
              }}
            />
          ) : null}
          <Button label="Cancel" variant="text" onPress={closeEditor} />
          <Button label="Save" disabled={blocked} onPress={save} />
        </>
      }
    >
      <TextField
        label="Name"
        value={value}
        onChange={setValue}
        onSubmit={save}
        error={error}
        focusOnMount
      />
    </DialogFrame>
  );
}

function IconDialog({ row }: { readonly row: NavRow }): ReactNode {
  const edits = useNavEdits();
  const face = faceOf(row);
  return (
    <DialogFrame
      open
      onClose={closeEditor}
      label={`Icon for ${face.title}`}
      title="Choose an icon"
      kind="dialog"
      wide
    >
      <NavIconChoices
        value={null}
        onChoose={(icon) => {
          edits.setIcon(row.key, icon);
          closeEditor();
        }}
      />
    </DialogFrame>
  );
}

function FolderDialog({ members }: { readonly members: readonly string[] }): ReactNode {
  const edits = useNavEdits();
  const [value, setValue] = useState('');
  const [icon, setIcon] = useState<NavIcon>(FOLDER_ICON);
  const error = nameError(value);
  const blocked = value.trim().length === 0 || error !== null;
  const create = (): void => {
    if (blocked) return;
    edits.newFolder(value.trim(), icon, members);
    closeEditor();
  };
  return (
    <DialogFrame
      open
      onClose={closeEditor}
      label="New folder"
      title="New folder"
      kind="dialog"
      wide
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={closeEditor} />
          <Button label="Create" disabled={blocked} onPress={create} />
        </>
      }
    >
      <View className="gap-4">
        <TextField
          label="Folder name"
          value={value}
          onChange={setValue}
          onSubmit={create}
          error={error}
          focusOnMount
        />
        <Text variant="caption" tone="faint">
          Icon
        </Text>
        <NavIconChoices value={icon} onChoose={setIcon} />
      </View>
    </DialogFrame>
  );
}

function Editor({ editor }: { readonly editor: NavEditor }): ReactNode {
  const model = useValue(navShown);
  if (editor.kind === 'folder') return <FolderDialog members={editor.members} />;
  if (editor.kind === 'picker') return null;
  const row = rowOf(model, editor.key);
  if (row === undefined) return null;
  return editor.kind === 'rename' ? <RenameDialog row={row} /> : <IconDialog row={row} />;
}

export function NavEditorHost(): ReactNode {
  const editor = useValue(navEditor);
  return editor === null ? null : <Editor editor={editor} />;
}
