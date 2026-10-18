import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { Text } from '../../../components/text';
import { splitMiddle } from '../../../components/text-middle';
import { PluginButton } from '../../shared/plugin-action';
import { useAdGuardTools } from '../adguard-data';
import type { RuleLine } from './own-rules';

function RuleText({ rule }: { readonly rule: string }): ReactNode {
  const { head, tail } = splitMiddle(rule);
  return (
    <View accessible accessibilityLabel={rule} className="min-w-0 max-w-full flex-row">
      <NativeText
        aria-hidden
        numberOfLines={1}
        className="shrink font-mono text-callout text-on-surface"
      >
        {head}
      </NativeText>
      {tail === '' ? null : (
        <NativeText aria-hidden className="shrink-0 font-mono text-callout text-on-surface">
          {tail}
        </NativeText>
      )}
    </View>
  );
}

function RemoveRule({
  domain,
  rule,
}: {
  readonly domain: string;
  readonly rule: string;
}): ReactNode {
  const tools = useAdGuardTools();
  return (
    <PluginButton
      label="Remove"
      variant="text"
      hint={`Removes ${rule}`}
      onPress={() => tools.run('remove_domain_rule', { domain }, 'The rule wasn’t removed')}
    />
  );
}

export function RuleRow({ line }: { readonly line: RuleLine }): ReactNode {
  return (
    <View className="min-h-row-h-2 flex-row items-center gap-3 px-4 py-2">
      <View className="min-w-0 flex-1 gap-0.5">
        <RuleText rule={line.text} />
        <Text variant="footnote" tone="variant">
          {line.effect}
        </Text>
      </View>
      {line.domain === null ? null : <RemoveRule domain={line.domain} rule={line.text} />}
    </View>
  );
}
