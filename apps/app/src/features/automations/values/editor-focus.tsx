import { createContext, useContext, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { Sheet } from '../../../components/sheet';
import { Button } from '../../../components/button';
import { EDITOR_FIELDS, type EditorField } from './focus-targets';
import { LibraryReturnContext } from './library-return';

interface EditorFocus {
  readonly target: string | null;
  readonly close: () => void;
  readonly open: (target: string) => void;
}
const FocusContext = createContext<EditorFocus>({
  target: null,
  close: (): void => undefined,
  open: (_target): void => undefined,
});
export function useEditorFocus(): EditorFocus {
  return useContext(FocusContext);
}
export function EditorFocusProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const router = useRouter();
  const embedded = useContext(LibraryReturnContext) !== null;
  const params = z
    .object({ focus: z.string().max(500).optional() })
    .safeParse(useLocalSearchParams());
  const requested = params.success ? params.data.focus : undefined;
  const target = embedded || requested === undefined || requested === '' ? null : requested;
  return (
    <FocusContext
      value={{
        target,
        open: (next): void => {
          router.setParams({ focus: next });
        },
        close: (): void => {
          router.setParams({ focus: '' });
        },
      }}
    >
      {children}
    </FocusContext>
  );
}
export function focusedField(target: string | null): EditorField | null {
  return Object.keys(EDITOR_FIELDS).find((key): key is EditorField => key === target) ?? null;
}
interface FocusedFieldsProps {
  readonly field: EditorField | null;
  readonly children: ReactNode;
  readonly title?: string;
}
export function FocusedFields({ field, children, title }: FocusedFieldsProps): ReactNode {
  const focus = useEditorFocus();
  if (field === null) return null;
  return (
    <Sheet
      open
      title={title ?? EDITOR_FIELDS[field].title}
      onClose={focus.close}
      detents={['full']}
      footer={<Button label="Done" onPress={focus.close} />}
    >
      {children}
    </Sheet>
  );
}
