import type { ReactNode, RefObject } from 'react';
import { TextInput, type TextInputKeyPressEvent } from 'react-native';
import { ASSISTANT_TEXT_MAX } from '@smarteverything/domain';
import { useIdiom } from '../../../design/platform';

export interface FieldKeys {
  readonly onCommandKey?: (key: string) => boolean;
  readonly onSend: () => void;
  readonly onEscape: () => void;
  readonly onEditLatest: (() => void) | null;
}

export interface ComposerFieldProps extends FieldKeys {
  readonly input: RefObject<TextInput | null>;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly tall?: boolean;
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
  text,
  setText,
  disabled,
  placeholder,
  tall = false,
  ...keys
}: ComposerFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <TextInput
      ref={input}
      value={text}
      onChangeText={setText}
      onKeyPress={(event) => {
        if (pointer) {
          handleKey(event, text, keys);
        }
      }}
      editable={!disabled}
      multiline
      numberOfLines={1}
      maxLength={ASSISTANT_TEXT_MAX}
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
