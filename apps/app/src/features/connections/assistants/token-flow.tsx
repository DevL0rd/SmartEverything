import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { createMcpToken, mcpServerUrlOf } from '../../../api/access';
import { useConnection } from '../../../api/transport';
import { Button } from '../../../components/button';
import { CodeBlock } from '../../../components/code';
import { FlowFrame } from '../../../components/flow-frame';
import { Text } from '../../../components/text';
import { useSession, useSettings } from '../../../store/selectors';
import { FlowButton } from '../flows/flow-button';
import { verifiedPublicUrl } from '../flows/remote-access-gate';
import { closeFlow } from '../flows/use-link-flow';
import { tokenNameFor, type TokenAssistant } from '../model/assistants';
import { useMutationState } from '../../../store/mutation';

interface ServerUrl {
  readonly url: string;
  readonly local: boolean;
}

function useServerUrl(): ServerUrl | null {
  const publicUrl = verifiedPublicUrl(useSettings());
  const connection = useConnection();
  if (publicUrl !== null) {
    return { url: publicUrl, local: false };
  }
  return connection.status === 'paired' ? { url: connection.connection.url, local: true } : null;
}

function Created({
  assistant,
  url,
  token,
}: {
  readonly assistant: TokenAssistant;
  readonly url: ServerUrl;
  readonly token: string;
}): ReactNode {
  const mcpUrl = mcpServerUrlOf(url.url);
  const install = assistant.install;
  return (
    <View className="gap-4">
      {install === null ? null : (
        <Button
          label={`Add to ${assistant.name}`}
          icon="externalLink"
          onPress={() => {
            void Linking.openURL(install(mcpUrl, token));
          }}
        />
      )}
      <CodeBlock label={assistant.snippetLabel} code={assistant.snippet(mcpUrl, token)} />
      <Text variant="footnote" tone="variant">
        This key is shown once. You can revoke it in Personal tokens.
      </Text>
      {url.local ? (
        <Text variant="footnote" tone="warning">
          Works on your home network only. Set up remote access to use it anywhere.
        </Text>
      ) : null}
    </View>
  );
}

export function TokenFlow({ assistant }: { readonly assistant: TokenAssistant }): ReactNode {
  const url = useServerUrl();
  const clientName = useSession().client.name;
  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutationState();
  const create = (): void => {
    mutation.run(() => createMcpToken(tokenNameFor(assistant, clientName)), {
      failure: 'No connection was made',
      onDone: setToken,
    });
  };
  return (
    <FlowFrame
      title={`Connect ${assistant.name}`}
      onCancel={closeFlow}
      wide
      footer={
        token === null ? (
          <FlowButton
            label="Create connection"
            loading={mutation.busy}
            disabled={url === null}
            onPress={create}
          />
        ) : (
          <FlowButton label="Done" onPress={closeFlow} />
        )
      }
    >
      {token === null || url === null ? (
        <Text variant="body" tone="variant">
          {`This makes a private key for ${assistant.name} and shows how to add it.`}
        </Text>
      ) : (
        <Created assistant={assistant} url={url} token={token} />
      )}
    </FlowFrame>
  );
}
