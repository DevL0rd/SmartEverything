import type { ReactNode } from 'react';
import { useContext } from 'react';
import { View } from 'react-native';
import type { AutomationValueContent, AutomationValueRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Select } from '../../../components/select';
import { useReloadSaved } from '../shared/editor-navigation';
import { LibraryReturnContext } from './library-return';
import { EditorFocusProvider, FocusedFields, focusedField, useEditorFocus } from './editor-focus';
import { ValueContentFields } from './value-content-fields';
import { useValueEditor, type ValueEditorState } from './use-value-editor';
import { VALUE_TYPE_LABELS, blankValue } from './value-content';

interface ValueEditorProps {
  readonly row: AutomationValueRow | null;
  readonly initialKind?: AutomationValueContent['kind'];
  readonly lockKind?: boolean;
}
function ValueFocus({ editor }: { readonly editor: ValueEditorState }): ReactNode {
  const focus = useEditorFocus();
  const field =
    focus.target?.startsWith('choice:') === true ? 'choices' : focusedField(focus.target);
  return (
    <FocusedFields field={field}>
      <ValueContentFields
        content={editor.content}
        onChange={editor.setContent}
        focus={focus.target}
      />
    </FocusedFields>
  );
}
interface ValueFormProps {
  readonly editor: ValueEditorState;
  readonly lockKind: boolean;
}
function ValueForm({ editor, lockKind }: ValueFormProps): ReactNode {
  return (
    <>
      {editor.row === null && !lockKind ? (
        <Select
          label="Type"
          value={editor.content.kind}
          options={(['boolean', 'number', 'duration', 'choice'] as const).map((value) => ({
            value,
            label: VALUE_TYPE_LABELS[value],
          }))}
          onChange={(kind) => {
            editor.setContent({ ...blankValue(kind), name: editor.content.name });
          }}
        />
      ) : null}
      <ValueContentFields content={editor.content} onChange={editor.setContent} />
    </>
  );
}
export function ValueEditor({ row, initialKind, lockKind }: ValueEditorProps): ReactNode {
  const editor = useValueEditor(row, initialKind);
  const destination = useContext(LibraryReturnContext);
  const reload = useReloadSaved();
  if (destination !== null)
    return (
      <View className="gap-section-gap">
        <ValueForm editor={editor} lockKind={lockKind === true} />
        <Button label="Save" loading={editor.busy} onPress={editor.save} />
      </View>
    );
  return (
    <EditorFocusProvider>
      <Screen
        maxWidth="reading"
        header={
          <PageHeader
            title={editor.row === null ? 'New value' : editor.row.content.name}
            overflow={
              editor.row === null
                ? []
                : [
                    { label: 'Reload saved', icon: 'refresh', onPress: reload },
                    { icon: 'trash', label: 'Delete', destructive: true, onPress: editor.remove },
                  ]
            }
          />
        }
        footer={<Button label="Save" loading={editor.busy} onPress={editor.save} />}
      >
        <ValueForm editor={editor} lockKind={lockKind === true} />
        <ValueFocus editor={editor} />
      </Screen>
    </EditorFocusProvider>
  );
}
