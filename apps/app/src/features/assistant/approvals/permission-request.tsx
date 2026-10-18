import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { CodeBlock } from '../../../components/code';
import { Text } from '../../../components/text';
import { ApprovalActions, type ApprovalHandlers } from './approval-actions';
import { DETAIL_LINES, isLongDetail } from './needs-you-model';

function Detail({ text }: { readonly text: string }): ReactNode {
  const [all, setAll] = useState(false);
  const long = isLongDetail(text);
  return (
    <View className="items-start gap-1">
      <Text selectable numberOfLines={long && !all ? DETAIL_LINES : undefined}>
        {text}
      </Text>
      {long ? (
        <Button
          label={all ? 'Show less' : 'Show all'}
          variant="text"
          onPress={() => {
            setAll(!all);
          }}
        />
      ) : null}
    </View>
  );
}

export function PermissionRequest({
  tool,
  reason,
  pending,
  handlers,
}: {
  readonly tool: string;
  readonly reason: string | undefined;
  readonly pending: boolean;
  readonly handlers: ApprovalHandlers;
}): ReactNode {
  return (
    <View className="gap-3">
      <CodeBlock code={tool} label="Tool" />
      {reason === undefined ? null : <Detail text={reason} />}
      <Text variant="footnote" tone="variant">
        Full action details weren’t sent.
      </Text>
      <ApprovalActions pending={pending} {...handlers} />
    </View>
  );
}
