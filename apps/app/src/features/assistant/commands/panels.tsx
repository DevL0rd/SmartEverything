import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { CommandDescriptor, CommandCompletion } from './types';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
export interface CommandReceipt {
  readonly name: string;
  readonly state: CommandCompletion | 'outcome unknown' | 'running' | 'admitted' | 'submitting';
  readonly text: string;
}
export function CommandResult({
  receipt,
  dismiss,
}: {
  readonly receipt: CommandReceipt;
  readonly dismiss: () => void;
}): ReactNode {
  return (
    <View className="gap-2 rounded-xl border-hairline border-outline-variant bg-surface-2 p-3">
      <View className="flex-row items-center justify-between">
        <Text variant="body-strong" accessibilityLiveRegion="polite">
          /{receipt.name} · {receipt.state}
        </Text>
        <Button
          label="Dismiss"
          variant="text"
          onPress={dismiss}
          disabled={['running', 'admitted', 'submitting'].includes(receipt.state)}
        />
      </View>
      <ScrollView className="max-h-44">
        <Text selectable>{receipt.text}</Text>
      </ScrollView>
    </View>
  );
}
interface SuggestionProps {
  readonly commands: readonly CommandDescriptor[];
  readonly selected: string | null;
  readonly choose: (name: string) => void;
  readonly reason: string | null;
  readonly retry: (() => void) | null;
}
function usePanelRoom(): {
  readonly ref: RefObject<View | null>;
  readonly frame: { readonly maxHeight: number };
  readonly measure: () => void;
} {
  const ref = useRef<View>(null);
  const { height } = useWindowDimensions();
  const [room, setRoom] = useState(320);
  const measure = (): void => {
    ref.current?.measureInWindow((_x, y) => {
      setRoom(Math.max(0, y - 8));
    });
  };
  useEffect(measure, [height]);
  return { ref, frame: { maxHeight: Math.min(320, room) }, measure };
}
export function CommandSuggestions(props: SuggestionProps): ReactNode {
  const { ref, frame, measure } = usePanelRoom();
  const matches = props.commands.filter((command) => command.id === props.selected);
  const detail = matches.length === 1 ? matches[0] : undefined;
  return (
    <View className="absolute bottom-full left-0 right-0 mb-2">
      <View ref={ref} onLayout={measure} className="absolute bottom-0 h-0 w-full" />
      <View
        style={frame}
        className="overflow-hidden rounded-xl border-hairline border-outline-variant bg-surface-raised elevation-2"
      >
        <ScrollView keyboardShouldPersistTaps="always">
          <CommandRows {...props} />
          {detail === undefined ? null : (
            <View className="gap-1 border-t-hairline border-outline-variant px-4 py-2">
              <Text variant="footnote" selectable>
                {detail.description}
              </Text>
              <CommandIdentity command={detail} />
              <CommandHint command={detail} />
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
function CommandRows({ commands, selected, choose, reason, retry }: SuggestionProps): ReactNode {
  if (reason !== null || commands.length === 0)
    return (
      <View className="gap-2 p-3">
        <Text tone="variant">{reason ?? 'No commands match this prefix.'}</Text>
        {retry === null ? null : <Button label="Refresh commands" variant="text" onPress={retry} />}
      </View>
    );
  return commands.map((command, index) => (
    <Interactive
      key={`${command.id}:${String(index)}`}
      label={`/${command.name}. ${command.description}`}
      selected={command.id === selected}
      onPress={() => {
        choose(command.id);
      }}
      className={
        command.id === selected
          ? 'min-h-touch-min gap-1 bg-primary/10 px-4 py-3'
          : 'min-h-touch-min gap-1 px-4 py-3'
      }
    >
      <Text variant="body-strong">/{command.name}</Text>
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {command.description}
      </Text>
    </Interactive>
  ));
}
export function CommandHint({ command }: { readonly command: CommandDescriptor }): ReactNode {
  return (
    <Text variant="caption" tone="variant">
      {command.unavailableReason ?? command.input?.hint ?? 'No argument hint supplied.'} ·{' '}
      {command.input?.attachments === true
        ? 'Attachments supported by this command'
        : 'No attachments declared'}
    </Text>
  );
}

function CommandIdentity({ command }: { readonly command: CommandDescriptor }): ReactNode {
  const native = command.native;
  if (native === undefined) return null;
  const skill = native.native_skill;
  return (
    <Text variant="caption" tone="variant" selectable>
      {native.source}
      {skill === undefined
        ? ''
        : ` · ${skill.scope} · native ${skill.enabled ? 'enabled' : 'disabled'}`}
      {native.path === null ? '' : ` · ${native.path}`}
    </Text>
  );
}
