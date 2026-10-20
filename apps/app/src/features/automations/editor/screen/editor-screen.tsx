import type { ReactNode } from 'react';
import { PhoneEditor } from './phone-editor';
import type { EditorScreenProps } from './screen-types';
import { useEditorModel } from './use-editor-model';
import { WideEditor } from './wide-editor';

export type { EditorScreenProps } from './screen-types';

export function EditorScreen(props: EditorScreenProps): ReactNode {
  const model = useEditorModel(props);
  return model.layout === 'phone' ? <PhoneEditor model={model} /> : <WideEditor model={model} />;
}
