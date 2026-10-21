import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { createMcpToken, mcpServerUrlOf } from '../../../api/access';
import { useConnection } from '../../../api/transport';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { CodeBlock } from '../../../components/code';
import { FlowFrame } from '../../../components/flow-frame';
import { ReasonLine } from '../../../components/reason-line';
import { ReadOnlyRow } from './read-only-row';
import { Text } from '../../../components/text';
import { useSession, useSettings } from '../../../store/selectors';
import { FlowButton } from '../flows/flow-button';
import { verifiedPublicUrl } from '../flows/remote-access-gate';
import { leaveFlow } from '../flows/leave-flow';
import { tokenNameFor, type TokenAssistant } from '../model/assistants';
import { useHubLive } from './revoke-access';
import { useMutationState } from '../../../store/mutation';
import { background } from '@smarteverything/logging';

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
            background(Linking.openURL(install(mcpUrl, token)), 'url.open_failed');
          }}
        />
      )}
      <Banner
        tone="warning"
        title="Copy it now"
        body="This key is shown once. You can revoke it in Personal tokens."
        wrapBody
      />
      <CodeBlock label={assistant.snippetLabel} code={assistant.snippet(mcpUrl, token)} />
      {url.local ? (
        <ReasonLine
          icon="wifi"
          tone="warning"
          text="Works on your home network only. Set up remote access to use it anywhere."
        />
      ) : null}
    </View>
  );
}

function TokenIntro({
  name,
  live,
  readOnly,
  setReadOnly,
}: {
  readonly name: string;
  readonly live: boolean;
  readonly readOnly: boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body" tone="variant">
        {`This makes a private key for ${name} and shows how to add it.`}
      </Text>
      <ReadOnlyRow who={name} value={readOnly} onChange={setReadOnly} />
      {live ? null : (
        <ReasonLine icon="wifiOff" text="Needs your home hub. Reconnect to continue." />
      )}
    </View>
  );
}

export function TokenFlow({ assistant }: { readonly assistant: TokenAssistant }): ReactNode {
  const url = useServerUrl();
  const clientName = useSession().client.name;
  const [token, setToken] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const mutation = useMutationState();
  const live = useHubLive();
  const create = (): void => {
    const access = readOnly ? 'read' : 'control';
    mutation.run(() => createMcpToken(tokenNameFor(assistant, clientName), access), {
      failure: 'No connection was made',
      onDone: setToken,
    });
  };
  return (
    <FlowFrame
      title={`Connect ${assistant.name}`}
      onCancel={leaveFlow}
      wide
      footer={
        token === null ? (
          <FlowButton
            label="Create connection"
            loading={mutation.busy}
            disabled={url === null || !live}
            onPress={create}
          />
        ) : (
          <FlowButton label="Done" onPress={leaveFlow} />
        )
      }
    >
      {token === null || url === null ? (
        <TokenIntro
          name={assistant.name}
          live={live}
          readOnly={readOnly}
          setReadOnly={setReadOnly}
        />
      ) : (
        <Created assistant={assistant} url={url} token={token} />
      )}
    </FlowFrame>
  );
}
