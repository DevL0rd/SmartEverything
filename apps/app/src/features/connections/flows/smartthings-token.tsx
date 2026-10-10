import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SMARTTHINGS_TOKEN_PAGE, SMARTTHINGS_TOKEN_SCOPES } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { SCOPE_LABELS, type TokenScope } from '../model/smartthings';
import { openInBrowser } from './prompt-body';

function Scope({
  scope,
  missing,
}: {
  readonly scope: TokenScope;
  readonly missing: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Icon
        name={missing ? 'alert' : 'circleCheck'}
        size={20}
        tone={missing ? 'critical' : 'primary'}
      />
      <Text variant="callout" tone={missing ? 'critical' : 'default'}>
        {SCOPE_LABELS[scope]}
      </Text>
    </View>
  );
}

export interface TokenStepProps {
  readonly token: string;
  readonly onToken: (token: string) => void;
  readonly onSubmit: () => void;
  readonly notice: string | null;
  readonly missing: readonly TokenScope[];
}

export function TokenStep({
  token,
  onToken,
  onSubmit,
  notice,
  missing,
}: TokenStepProps): ReactNode {
  return (
    <View className="gap-5">
      {notice === null ? null : <Banner tone="critical" title={notice} />}
      <View className="gap-3">
        <Text variant="body-strong">1. Create a one-time key</Text>
        <Button
          label="Open SmartThings tokens"
          variant="tonal"
          icon="externalLink"
          onPress={() => {
            openInBrowser(SMARTTHINGS_TOKEN_PAGE);
          }}
        />
      </View>
      <View className="gap-2">
        <Text variant="body-strong">2. Tick these boxes</Text>
        {SMARTTHINGS_TOKEN_SCOPES.map((scope) => (
          <Scope key={scope} scope={scope} missing={missing.includes(scope)} />
        ))}
      </View>
      <TextField
        label="3. Paste the token"
        kind="password"
        value={token}
        onChange={onToken}
        onSubmit={onSubmit}
        helper="Used once, not stored."
      />
    </View>
  );
}
