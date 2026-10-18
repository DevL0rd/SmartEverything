import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { CommandDescriptor, CommandCompletion } from './types';
import { Text } from '../../../components/text';
import { SuggestionPanel } from '../components/suggestion-panel';
import { SuggestionGroup, SuggestionReason, SuggestionRow } from '../components/suggestion-rows';
import { Button } from '../../../components/button';
import { KeyboardListbox } from '../../../components/keyboard-list';
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
export interface QuoteConflict {
  readonly remove: () => void;
}

interface SuggestionProps {
  readonly commands: readonly CommandDescriptor[];
  readonly selected: string | null;
  readonly choose: (name: string) => void;
  readonly reason: string | null;
  readonly retry: (() => void) | null;
  readonly quote: QuoteConflict | null;
}

export function CommandSuggestions(props: SuggestionProps): ReactNode {
  const matches = props.commands.filter((command) => command.id === props.selected);
  const detail = matches.length === 1 ? matches[0] : undefined;
  return (
    <SuggestionPanel>
      <ScrollView keyboardShouldPersistTaps="always">
        <CommandRows {...props} />
        {detail === undefined || props.quote !== null || props.reason !== null ? null : (
          <View className="gap-1 border-t-hairline border-outline-variant px-4 py-2">
            <Text variant="footnote" selectable>
              {detail.description}
            </Text>
            <CommandIdentity command={detail} />
            <CommandHint command={detail} />
          </View>
        )}
      </ScrollView>
    </SuggestionPanel>
  );
}

function CommandRows({ commands, choose, reason, retry, quote }: SuggestionProps): ReactNode {
  if (quote !== null) {
    return (
      <SuggestionReason
        icon="info"
        text="Remove the quote to run a command."
        action={{ label: 'Remove quote', onPress: quote.remove }}
      />
    );
  }
  if (reason !== null) {
    return (
      <SuggestionReason
        icon="info"
        text={reason}
        action={retry === null ? null : { label: 'Try again', onPress: retry }}
      />
    );
  }
  if (commands.length === 0) {
    return <SuggestionReason icon="search" text="No commands match this prefix." />;
  }
  return (
    <KeyboardListbox>
      <SuggestionGroup label="Commands">
        {commands.map((command) => (
          <SuggestionRow
            key={command.id}
            id={command.id}
            icon="terminal"
            title={`/${command.name}`}
            subtitle={command.description}
            onChoose={choose}
          />
        ))}
      </SuggestionGroup>
    </KeyboardListbox>
  );
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
