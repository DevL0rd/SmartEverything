import type { ReactNode, RefObject } from 'react';
import type { AiChatRow, AiMessageReference } from '@smarteverything/domain';
import { useComposerState, type ComposerState } from './use-composer-state';
import { CommandTransientProvider } from '../commands/transient';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { View, useWindowDimensions } from 'react-native';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { useIdiom } from '../../../design/platform';
import { useFilePaste } from '../../../platform/file-drop';
import { attachFiles } from '../data/uploads';
import { sendModeOf, showsCounter } from '../model/composer-state';
import { ComposerAccessoryLayoutProvider } from './composer-accessory-layout';
import { ComposerEditor } from './composer-editor';
import { ComposerField } from './composer-field';
import { AttachButton, Counter, ExpandButton, QuoteChip } from './composer-extras';
import { SendButton } from './composer-send';
import { ReferenceChips } from '../references/chips';
import { UploadChips } from './upload-chips';

export type MessageSender = (
  text: string,
  attachments: readonly string[],
  references?: readonly AiMessageReference[],
  clientMessageId?: string,
) => Promise<boolean>;

const EXPAND_LINES = 4;

const EXPAND_CHARS = 240;

const ACCESSORIES_ROW_MIN_WIDTH = 300;
const COMPACT_ACCESSORIES_AT = 400;
const COMPACT_PICKER_CHROME = 38;
interface ActionWidths {
  readonly attach: number;
  readonly send: number;
  readonly expand: number;
}
type MeasureAction = (part: keyof ActionWidths, width: number) => void;

function wantsEditor(text: string): boolean {
  return text.split('\n').length > EXPAND_LINES || text.length > EXPAND_CHARS;
}

export interface ComposerProps {
  readonly commandChat?: AiChatRow;
  readonly disabled: boolean;
  readonly sendDisabled?: boolean;
  readonly placeholder: string;
  readonly focusOnMount?: boolean;
  readonly onSent?: () => void;
  readonly draftKey?: string;
  readonly send: MessageSender;
  readonly stop?: (() => void) | null;
  readonly accessory?: ReactNode;
  readonly rightAccessory?: ReactNode;
  readonly offline?: boolean;
  readonly onEditLatest?: (() => void) | null;
  readonly shortcuts?: boolean;
}

function useFocusShortcut(input: RefObject<TextInput | null>, enabled: boolean): void {
  useKeyboard((press: KeyPress) => {
    if (!enabled || !press.command || press.key !== '/') {
      return false;
    }
    input.current?.focus();
    return true;
  }, true);
}

interface PartProps {
  readonly config: ComposerProps;
  readonly state: ComposerState;
}

function Field({ config, state }: PartProps): ReactNode {
  const { stop = null, onEditLatest = null } = config;
  return (
    <ComposerField
      input={state.input}
      text={state.text}
      setText={state.setText}
      disabled={config.disabled}
      placeholder={config.placeholder}
      selection={state.mentions.selection}
      onSelection={state.mentions.select}
      onCommandKey={(key): boolean =>
        state.mentions.handleKey(key) || state.commands.handleKey(key)
      }
      onSend={state.send}
      onEscape={() => {
        if (state.text === '' && stop !== null) {
          stop();
        } else {
          state.input.current?.blur();
        }
      }}
      onEditLatest={onEditLatest}
    />
  );
}

function Action({ config, state }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { stop = null, offline = false } = config;
  const ready = state.filled && !config.disabled && config.sendDisabled !== true;
  const mode = sendModeOf(ready, stop !== null, offline);
  return (
    <View className="flex-row items-center gap-1">
      {mode === 'send' && stop !== null && !offline ? (
        <SendButton mode="stop" onSend={state.send} onStop={stop} shortcut={null} />
      ) : null}
      <SendButton
        mode={mode}
        onSend={state.send}
        onStop={() => {
          stop?.();
        }}
        shortcut={pointer ? 'Enter' : null}
      />
    </View>
  );
}

function Rows({ config, state }: PartProps): ReactNode {
  const [width, setWidth] = useState(0);
  const [permissionWidth, setPermissionWidth] = useState(100);
  const { actions, measureAction } = useActionWidths();
  const { fontScale } = useWindowDimensions();
  const pointer = useIdiom() === 'pointer';
  const stacked =
    config.rightAccessory !== undefined && width / fontScale < ACCESSORIES_ROW_MIN_WIDTH;
  const compact = width / fontScale < COMPACT_ACCESSORIES_AT;
  const expand = !pointer && wantsEditor(state.text);
  const labelWidth = modelLabelWidth({
    width,
    permission: permissionWidth,
    actions,
    stacked,
    expand,
    compact,
  });
  return (
    <>
      <View className="flex-row px-2">
        <Field config={config} state={state} />
      </View>
      {showsCounter(state.text.length) ? (
        <View className="items-end px-2">
          <Counter length={state.text.length} />
        </View>
      ) : null}
      <View
        onLayout={(event): void => {
          setWidth(event.nativeEvent.layout.width);
        }}
        className="gap-1"
      >
        <ComposerAccessoryLayoutProvider
          value={{ compact, modelLabelWidth: labelWidth / fontScale }}
        >
          <ComposerAccessories
            config={config}
            state={state}
            stacked={stacked}
            measurePermission={setPermissionWidth}
            measureAction={measureAction}
          />
        </ComposerAccessoryLayoutProvider>
      </View>
    </>
  );
}
function ComposerAccessories({
  config,
  state,
  stacked,
  measurePermission,
  measureAction,
}: PartProps & {
  readonly stacked: boolean;
  readonly measurePermission: (width: number) => void;
  readonly measureAction: MeasureAction;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const expand =
    !pointer && wantsEditor(state.text) ? (
      <MeasuredExpand state={state} measure={measureAction} />
    ) : null;
  return (
    <>
      <View className="flex-row items-center gap-1">
        <MeasuredAction part="attach" measure={measureAction}>
          <AttachButton disabled={false} />
        </MeasuredAction>
        <View
          className="shrink-0"
          onLayout={(event): void => {
            measurePermission(event.nativeEvent.layout.width);
          }}
        >
          {config.accessory}
        </View>
        <View className="flex-1" />
        {stacked ? null : config.rightAccessory}
        {stacked ? null : expand}
        <MeasuredAction part="send" measure={measureAction}>
          <Action config={config} state={state} />
        </MeasuredAction>
      </View>
      {stacked ? (
        <View className="flex-row items-center justify-end gap-1">
          {expand}
          {config.rightAccessory}
        </View>
      ) : null}
    </>
  );
}

function ChatComposerBody({ config, state }: PartProps): ReactNode {
  const plain =
    (config.accessory === undefined || config.accessory === null) &&
    (config.rightAccessory === undefined || config.rightAccessory === null);
  return (
    <View className="rounded-xxl border-hairline border-outline-variant bg-surface-2 p-1">
      {state.quote === null ? null : (
        <QuoteChip
          quote={state.quote}
          onRemove={() => {
            state.setQuote(null);
          }}
        />
      )}
      {plain ? (
        <View className="flex-row items-end gap-1">
          <AttachButton disabled={config.disabled} />
          <Field config={config} state={state} />
          <Action config={config} state={state} />
        </View>
      ) : (
        <Rows config={config} state={state} />
      )}
    </View>
  );
}

export function Composer(props: ComposerProps): ReactNode {
  const state = useComposerState(props);
  const ready = state.filled && !props.disabled && props.sendDisabled !== true;
  const pasteTarget = useRef<View>(null);
  useFilePaste(pasteTarget, attachFiles);
  useFocusShortcut(state.input, props.shortcuts === true);
  return (
    <View ref={pasteTarget} className="gap-2">
      {state.commands.result}
      {state.commands.hint}
      <UploadChips />
      <ReferenceChips references={state.references} remove={state.mentions.remove} />
      <View className="relative">
        {state.editor ? null : state.mentions.panel}
        {state.commands.panel}
        <CommandTransientProvider
          opened={state.commands.opened || state.mentions.opened}
          dismiss={(): void => {
            state.commands.dismiss();
            state.mentions.dismiss();
          }}
        >
          <ChatComposerBody config={props} state={state} />
        </CommandTransientProvider>
      </View>
      <ComposerEditor
        open={state.editor}
        onClose={() => {
          state.setEditor(false);
        }}
        text={state.text}
        setText={state.setText}
        placeholder={props.placeholder}
        ready={ready}
        onSend={state.send}
        mentions={state.mentions}
        onCommandKey={(key): boolean =>
          state.mentions.handleKey(key) || state.commands.handleKey(key)
        }
        references={state.references}
      />
    </View>
  );
}

function MeasuredAction({
  part,
  measure,
  children,
}: {
  readonly part: keyof ActionWidths;
  readonly measure: MeasureAction;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className="shrink-0"
      onLayout={(event): void => {
        measure(part, event.nativeEvent.layout.width);
      }}
    >
      {children}
    </View>
  );
}
function modelLabelWidth({
  width,
  permission,
  actions,
  stacked,
  expand,
  compact,
}: {
  readonly width: number;
  readonly permission: number;
  readonly actions: ActionWidths;
  readonly stacked: boolean;
  readonly expand: boolean;
  readonly compact: boolean;
}): number {
  const chrome = COMPACT_PICKER_CHROME + (compact ? 0 : 20);
  const editor = expand ? actions.expand : 0;
  if (stacked)
    return Math.max(0, Math.min(192 - chrome, width - editor - (expand ? 4 : 0) - chrome));
  const gaps = expand ? 20 : 16;
  return Math.max(
    0,
    Math.min(
      192 - chrome,
      width - permission - actions.attach - actions.send - editor - gaps - chrome,
    ),
  );
}

function MeasuredExpand({
  state,
  measure,
}: {
  readonly state: ComposerState;
  readonly measure: MeasureAction;
}): ReactNode {
  return (
    <MeasuredAction part="expand" measure={measure}>
      <ExpandButton
        onPress={(): void => {
          state.setEditor(true);
        }}
      />
    </MeasuredAction>
  );
}

function useActionWidths(): {
  readonly actions: ActionWidths;
  readonly measureAction: MeasureAction;
} {
  const [actions, setActions] = useState<ActionWidths>({ attach: 48, send: 48, expand: 48 });
  const measureAction: MeasureAction = (part, width): void => {
    setActions((previous) =>
      previous[part] === width ? previous : { ...previous, [part]: width },
    );
  };
  return { actions, measureAction };
}
