import type { ReactNode, RefObject } from 'react';
import { TextInput, type TextInputKeyPressEvent } from 'react-native';
import type { ComposerSelection } from '../references/intent';
import { useKeyboardCombobox } from '../../../components/keyboard-list';
import { useIdiom } from '../../../design/platform';
import { useDraft } from '../data/drafts';

interface FieldKeys {
  readonly onCommandKey?: (key: string) => boolean;
  readonly onSend: () => void;
  readonly onEscape: () => void;
  readonly onEditLatest: (() => void) | null;
}

export interface ComposerFieldProps extends FieldKeys {
  readonly input: RefObject<TextInput | null>;
  readonly draftKey: string;
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly tall?: boolean;
  readonly onFocus?: (() => void) | undefined;
  readonly selection?: ComposerSelection | undefined;
  readonly onSelection?: (selection: ComposerSelection) => void;
}

function handleKey(event: TextInputKeyPressEvent, text: string, keys: FieldKeys): void {
  const native = event.nativeEvent;
  const shift = 'shiftKey' in native && native.shiftKey === true;
  if (commandKey(event, keys)) return;
  if (native.key === 'Enter' && !shift) {
    event.preventDefault();
    keys.onSend();
    return;
  }
  if (native.key === 'Escape') {
    keys.onEscape();
    return;
  }
  if (native.key === 'ArrowUp' && text === '' && keys.onEditLatest !== null) {
    event.preventDefault();
    keys.onEditLatest();
  }
}

export function ComposerField({
  input,
  draftKey,
  disabled,
  placeholder,
  tall = false,
  onFocus,
  selection,
  onSelection,
  ...keys
}: ComposerFieldProps): ReactNode {
  const [text, setText] = useDraft(draftKey);
  const pointer = useIdiom() === 'pointer';
  const combobox = useKeyboardCombobox();
  return (
    <TextInput
      ref={input}
      {...combobox}
      value={text}
      selection={selection}
      onSelectionChange={(event): void => {
        onSelection?.(event.nativeEvent.selection);
      }}
      onChangeText={setText}
      onFocus={onFocus}
      onKeyPress={(event) => {
        if (pointer) {
          handleKey(event, text, keys);
        }
      }}
      editable={!disabled}
      multiline
      numberOfLines={1}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-on-surface-faint"
      cursorColorClassName="accent-primary"
      selectionColorClassName="accent-primary"
      accessibilityLabel="Message"
      className={
        tall
          ? 'min-h-0 flex-1 resize-none px-1 py-3 font-sans text-body text-on-surface outline-none'
          : 'field-sizing-content max-h-48 min-h-touch-min flex-1 resize-none px-1 py-3 font-sans text-body text-on-surface outline-none'
      }
    />
  );
}

function commandKey(event: TextInputKeyPressEvent, keys: FieldKeys): boolean {
  const native = event.nativeEvent;
  if (isComposing(event)) return true;
  if ('shiftKey' in native && native.shiftKey === true) return false;
  if (keys.onCommandKey?.(native.key) !== true) return false;
  event.preventDefault();
  return true;
}

function isComposing(event: TextInputKeyPressEvent): boolean {
  const native = event.nativeEvent;
  return (
    ('isComposing' in native && native.isComposing === true) ||
    ('keyCode' in native && native.keyCode === 229)
  );
}
