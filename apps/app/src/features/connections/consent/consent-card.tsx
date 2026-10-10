import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { McpConsentRequest } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Decision } from './use-decide';

const ACCESS = {
  read: { icon: 'eye', text: 'See your devices and rooms' },
  control: { icon: 'power', text: 'Change things in your home' },
} as const;

export function consentTitle(request: McpConsentRequest): string {
  return `${request.clientName} wants to use your home`;
}

export function ConsentDetails({ request }: { readonly request: McpConsentRequest }): ReactNode {
  return (
    <View className="gap-3">
      {request.access.map((access) => (
        <View key={access} className="flex-row items-center gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-surface-2">
            <Icon name={ACCESS[access].icon} size={20} />
          </View>
          <Text variant="body" className="flex-1">
            {ACCESS[access].text}
          </Text>
        </View>
      ))}
      {request.clientUri === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {request.clientUri}
        </Text>
      )}
    </View>
  );
}

export function ConsentButtons({
  decision,
  grow,
}: {
  readonly decision: Decision;
  readonly grow: boolean;
}): ReactNode {
  return (
    <>
      <Button
        label="Deny"
        variant="outlined"
        grow={grow}
        disabled={decision.busy !== null}
        loading={decision.busy === 'deny'}
        onPress={() => {
          decision.decide('deny');
        }}
      />
      <Button
        label="Allow"
        grow={grow}
        disabled={decision.busy !== null}
        loading={decision.busy === 'allow'}
        onPress={() => {
          decision.decide('allow');
        }}
      />
    </>
  );
}
