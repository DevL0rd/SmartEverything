import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { ASSISTANT_TEXT_MAX } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { notify } from '../../../components/toast-store';
import { useColour } from '../../../design/colour';
import { useIdiom } from '../../../design/platform';
import { useFilePaste } from '../../../platform/file-drop';
import { PickerMissingError, pickFiles, type PickSource } from '../../../platform/pick-files';
import { sendMessage } from '../data/send';
import { useDraft } from '../data/drafts';
import { attachFiles, readyAttachments, useUploads } from '../data/uploads';
import { UploadChips } from './upload-chips';

function pick(source: PickSource): void {
  pickFiles(source).then(attachFiles, (error: unknown) => {
    if (error instanceof PickerMissingError) {
      notify({ message: error.message, tone: 'critical' });
      return;
    }
    notify({ message: 'Couldn’t open the picker', error, tone: 'critical' });
  });
}

const ATTACH_ITEMS: readonly MenuItem[] = [
  {
    label: 'Take a photo',
    icon: 'camera',
    onPress: (): void => {
      pick('camera');
    },
  },
  {
    label: 'Photos',
    icon: 'image',
    onPress: (): void => {
      pick('photos');
    },
  },
  {
    label: 'Files',
    icon: 'fileText',
    onPress: (): void => {
      pick('files');
    },
  },
];

interface Sender {
  readonly ready: boolean;
  readonly send: () => void;
}

export type MessageSender = (text: string, attachments: readonly string[]) => Promise<boolean>;

function useSender(text: string, deliver: MessageSender, clear: () => void): Sender {
  const attachments = readyAttachments(useUploads());
  const [sending, setSending] = useState(false);
  const ready = attachments !== null && (text.trim() !== '' || attachments.length > 0);
  const send = (): void => {
    if (!ready || sending) {
      return;
    }
    setSending(true);
    void deliver(text, attachments).then((sent) => {
      setSending(false);
      if (sent) {
        clear();
      }
    });
  };
  return { ready: ready && !sending, send };
}

function AttachButton({ disabled }: { readonly disabled: boolean }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(ATTACH_ITEMS, 'Attach');
  return (
    <View ref={ref}>
      <IconButton icon="paperclip" label="Attach" onPress={open} disabled={disabled} />
      {menu}
    </View>
  );
}

function Field({
  input,
  text,
  setText,
  onSend,
  disabled,
  placeholder,
}: {
  readonly input: RefObject<TextInput | null>;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly onSend: () => void;
  readonly disabled: boolean;
  readonly placeholder: string;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const faint = useColour('on-surface-faint');
  const onKey = (event: TextInputKeyPressEvent): void => {
    const shift = 'shiftKey' in event.nativeEvent && event.nativeEvent.shiftKey === true;
    if (pointer && event.nativeEvent.key === 'Enter' && !shift) {
      event.preventDefault();
      onSend();
    }
  };
  return (
    <TextInput
      ref={input}
      value={text}
      onChangeText={setText}
      onKeyPress={onKey}
      editable={!disabled}
      multiline
      numberOfLines={1}
      maxLength={ASSISTANT_TEXT_MAX}
      placeholder={placeholder}
      placeholderTextColor={faint}
      accessibilityLabel="Message"
      className="field-sizing-content max-h-48 min-h-touch-min flex-1 resize-none px-1 py-3 font-sans text-body text-on-surface outline-none"
    />
  );
}

function IdleSend(): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Send"
      accessibilityState={{ disabled: true }}
      className="size-touch-min items-center justify-center"
    >
      <View className="size-9 items-center justify-center rounded-full bg-surface-3">
        <Icon name="arrowUp" size={20} tone="variant" />
      </View>
    </View>
  );
}

function SendButton({
  ready,
  stop,
  onSend,
  shortcut,
}: {
  readonly ready: boolean;
  readonly stop: (() => void) | null;
  readonly onSend: () => void;
  readonly shortcut: string | null;
}): ReactNode {
  if (stop !== null) {
    return <IconButton icon="square" label="Stop" variant="filled" onPress={stop} />;
  }
  if (!ready) {
    return <IdleSend />;
  }
  return (
    <IconButton
      icon="arrowUp"
      label="Send"
      variant="filled"
      onPress={onSend}
      {...(shortcut === null ? {} : { shortcut })}
    />
  );
}

function ComposerLayout({
  attach,
  field,
  accessory,
  action,
}: {
  readonly attach: ReactNode;
  readonly field: ReactNode;
  readonly accessory: ReactNode;
  readonly action: ReactNode;
}): ReactNode {
  if (accessory === null) {
    return (
      <View className="flex-row items-end gap-1">
        {attach}
        {field}
        {action}
      </View>
    );
  }
  return (
    <>
      <View className="flex-row px-2">{field}</View>
      <View className="flex-row items-center gap-1">
        {attach}
        {accessory}
        <View className="flex-1" />
        {action}
      </View>
    </>
  );
}

export interface ComposerProps {
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly focusOnMount?: boolean;
  readonly onSent?: () => void;
  readonly draftKey?: string;
  readonly send?: MessageSender;
  readonly stop?: (() => void) | null;
  readonly accessory?: ReactNode;
}

export function Composer({
  disabled,
  placeholder,
  focusOnMount = false,
  onSent,
  draftKey = 'coordinator',
  send: deliver = sendMessage,
  stop = null,
  accessory = null,
}: ComposerProps): ReactNode {
  const [text, setText] = useDraft(draftKey);
  const input = useFocusOnMount(focusOnMount);
  const pointer = useIdiom() === 'pointer';
  const { ready, send } = useSender(text, deliver, () => {
    setText('');
    onSent?.();
  });
  useFilePaste(input, attachFiles);
  return (
    <View className="gap-2">
      <UploadChips />
      <View className="rounded-xxl border-hairline border-outline-variant bg-surface-2 p-1">
        <ComposerLayout
          attach={<AttachButton disabled={disabled} />}
          field={
            <Field
              input={input}
              text={text}
              setText={setText}
              onSend={send}
              disabled={disabled}
              placeholder={placeholder}
            />
          }
          accessory={accessory}
          action={
            <SendButton
              ready={!disabled && ready}
              stop={stop}
              onSend={send}
              shortcut={pointer ? 'Enter' : null}
            />
          }
        />
      </View>
    </View>
  );
}
