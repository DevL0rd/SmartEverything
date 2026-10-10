import type { ReactNode } from 'react';
import { useState } from 'react';
import { href } from '../../../app-shell/hrefs';
import { revokeOAuthGrant } from '../../../api/access';
import { RowBrand } from '../row-brand';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { ActionRow, NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { useMinute } from '../../../store/clock';
import { useConsentRequests, useRows, useSettings } from '../../../store/selectors';
import { ApprovalCode } from '../consent/approval-code';
import { assistantStatus } from '../model/assistant-status';
import { ASSISTANTS } from '../model/assistants';
import { toolsSummary } from '../model/tools';
import { SettingsFrame } from '../../../settings/settings-frame';

function Waiting(): ReactNode {
  const requests = useConsentRequests();
  if (requests.length === 0) {
    return null;
  }
  return (
    <List inset title="Waiting for you">
      {requests.map((request) => (
        <ListRow
          key={request.id}
          icon="key"
          iconTone="primary"
          title={request.clientName}
          subtitle="Wants to use your home"
          href={href.consent(request.id)}
          chevron
        />
      ))}
    </List>
  );
}

function Assistants(): ReactNode {
  const clients = useRows('oauth_clients');
  const tokens = useRows('mcp_tokens');
  const now = useMinute();
  return (
    <List inset title="Assistants">
      {ASSISTANTS.map((assistant) => {
        const status = assistantStatus(assistant, clients, tokens, now);
        return (
          <ListRow
            key={assistant.key}
            leading={<RowBrand brand={assistant.brand} />}
            title={assistant.name}
            subtitle={status.text}
            subtitleTone={status.connected ? 'positive' : 'variant'}
            href={href.assistant(assistant.key)}
            chevron
          />
        );
      })}
    </List>
  );
}

function revoke(clientId: string, name: string): void {
  void confirm({
    title: `Revoke ${name}?`,
    body: 'It stops working at once.',
    confirmLabel: 'Revoke',
    tone: 'destructive',
  }).then((accepted) => {
    if (accepted) {
      revokeOAuthGrant(clientId).catch((error: unknown) => {
        notify({ message: `${name} wasn’t revoked`, error, tone: 'critical' });
      });
    }
  });
}

function Allowed(): ReactNode {
  const clients = useRows('oauth_clients');
  if (clients.length === 0) {
    return null;
  }
  return (
    <List inset title="Apps you allowed">
      {clients.map((client) => {
        const onRevoke = (): void => {
          revoke(client.id, client.name);
        };
        return (
          <ListRow
            key={client.id}
            icon="sparkles"
            title={client.name}
            {...(client.uri === null ? {} : { subtitle: client.uri })}
            trailing={<Button label="Revoke" variant="text" onPress={onRevoke} />}
          />
        );
      })}
    </List>
  );
}

function More(): ReactNode {
  const disabled = useSettings().mcp_disabled_tools;
  const tokens = useRows('mcp_tokens').filter((token) => token.revoked_at === null).length;
  const [code, setCode] = useState(false);
  return (
    <>
      <List inset>
        <NavRow
          icon="wrench"
          title="Exposed tools"
          value={toolsSummary(disabled)}
          href={href.settings.page('assistant/integrations/tools')}
        />
        <NavRow
          icon="key"
          title="Personal tokens"
          value={tokens === 0 ? 'None' : String(tokens)}
          href={href.settings.page('assistant/integrations/tokens')}
        />
        <ActionRow
          icon="qr"
          title="Show a code"
          subtitle="For assistants that ask for one"
          onPress={() => {
            setCode(true);
          }}
        />
      </List>
      <Sheet
        open={code}
        onClose={() => {
          setCode(false);
        }}
        title="Approval code"
        detents={['fit']}
      >
        <ApprovalCode />
      </Sheet>
    </>
  );
}

export function AssistantsScreen(): ReactNode {
  return (
    <SettingsFrame page="assistant/integrations">
      <Waiting />
      <Assistants />
      <Allowed />
      <More />
    </SettingsFrame>
  );
}
