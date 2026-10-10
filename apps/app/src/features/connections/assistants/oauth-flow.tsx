import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { McpConsentRequest } from '@smarteverything/domain';
import { mcpServerUrlOf } from '../../../api/access';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { CopyField } from '../../../components/copy-field';
import { FlowFrame } from '../../../components/flow-frame';
import { Text } from '../../../components/text';
import { useConsentRequests, useRows, useSettings } from '../../../store/selectors';
import { ApprovalCode } from '../consent/approval-code';
import { ConsentButtons, ConsentDetails } from '../consent/consent-card';
import { useDecide } from '../consent/use-decide';
import { FlowButton } from '../flows/flow-button';
import { RemoteAccessGate, verifiedPublicUrl } from '../flows/remote-access-gate';
import { closeFlow } from '../flows/use-link-flow';
import type { OAuthAssistant } from '../model/assistants';
import { AssistantDone } from './assistant-done';

function InlineConsent({ request }: { readonly request: McpConsentRequest }): ReactNode {
  const decision = useDecide(request, () => undefined);
  return (
    <View className="gap-4 rounded-lg bg-primary-container p-card-pad">
      <Text variant="body-strong">{`${request.clientName} wants to use your home`}</Text>
      <ConsentDetails request={request} />
      <View className="flex-row gap-3">
        <ConsentButtons decision={decision} grow />
      </View>
    </View>
  );
}

function Approve({ assistant }: { readonly assistant: OAuthAssistant }): ReactNode {
  const request = useConsentRequests()[0];
  const [code, setCode] = useState(false);
  return (
    <View className="gap-3">
      <Text variant="body-strong">2. Approve here</Text>
      {request === undefined ? (
        <View className="flex-row items-center gap-3">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" tone="variant" className="flex-1">
            {`Waiting for ${assistant.name} to ask…`}
          </Text>
        </View>
      ) : (
        <InlineConsent request={request} />
      )}
      {code ? (
        <ApprovalCode />
      ) : (
        <Button
          label="Can’t approve here? Show a code"
          variant="text"
          onPress={() => {
            setCode(true);
          }}
        />
      )}
    </View>
  );
}

function Steps({
  assistant,
  mcpUrl,
}: {
  readonly assistant: OAuthAssistant;
  readonly mcpUrl: string;
}): ReactNode {
  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text variant="body-strong">{`1. Add SmartEverything to ${assistant.name}`}</Text>
        <Text variant="callout" tone="variant">
          {assistant.reach}
        </Text>
        <CopyField label="Server link" value={mcpUrl} />
        <Button
          label={assistant.openLabel}
          icon="externalLink"
          onPress={() => {
            copyText(mcpUrl, 'Server link');
            void Linking.openURL(assistant.open(mcpUrl));
          }}
        />
      </View>
      <Approve assistant={assistant} />
    </View>
  );
}

function useNewGrant(assistant: OAuthAssistant): boolean {
  const clients = useRows('oauth_clients');
  const [before] = useState(() => clients.map((client) => client.id));
  return clients.some(
    (client) => !before.includes(client.id) && assistant.clientName.test(client.name),
  );
}

export function OAuthFlow({ assistant }: { readonly assistant: OAuthAssistant }): ReactNode {
  const publicUrl = verifiedPublicUrl(useSettings());
  const connected = useNewGrant(assistant);
  const body =
    publicUrl === null ? (
      <RemoteAccessGate who={assistant.name} />
    ) : connected ? (
      <AssistantDone name={assistant.name} />
    ) : (
      <Steps assistant={assistant} mcpUrl={mcpServerUrlOf(publicUrl)} />
    );
  return (
    <FlowFrame
      title={`Connect ${assistant.name}`}
      onCancel={closeFlow}
      footer={
        <FlowButton
          label={connected ? 'Done' : 'Close'}
          variant={connected ? 'filled' : 'outlined'}
          onPress={closeFlow}
        />
      }
    >
      {body}
    </FlowFrame>
  );
}
