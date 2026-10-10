import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AssistantStatus, ResponderApp } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { useIsOwner } from '../../../store/selectors';
import { canSetUpHere, useAssistantStatus } from '../data/assistant-data';
import { useResponderActions } from '../data/responder-actions';
import { appText } from '../data/responder-view';

function Action({
  status,
  app,
}: {
  readonly status: AssistantStatus;
  readonly app: ResponderApp;
}): ReactNode {
  const actions = useResponderActions();
  const [busy, setBusy] = useState(false);
  const state = status.apps.find((entry) => entry.app === app)?.state ?? 'not_connected';
  if (state === 'not_installed') {
    return null;
  }
  const run = (work: () => Promise<boolean>): void => {
    setBusy(true);
    void work().then(() => {
      setBusy(false);
    });
  };
  const connected = state === 'connected';
  return (
    <Button
      label={connected ? 'Disconnect' : state === 'needs_repair' ? 'Repair' : 'Connect'}
      variant={connected ? 'text' : 'tonal'}
      loading={busy}
      onPress={() => {
        run(() => (connected ? actions.disconnect(app) : actions.connect(app)));
      }}
    />
  );
}

export function ConnectionRow({ app }: { readonly app: ResponderApp }): ReactNode {
  const status = useAssistantStatus();
  const owner = useIsOwner();
  if (status === null) {
    return <ListRow title="Connection" subtitle="Can’t reach your server" icon="link" />;
  }
  const entry = status.apps.find((candidate) => candidate.app === app);
  const state = entry?.state ?? 'not_connected';
  const here = owner && canSetUpHere(status);
  return (
    <ListRow
      title="Connection"
      subtitle={
        entry?.detail ?? (here ? appText(state) : `${appText(state)} · Change it on your computer`)
      }
      subtitleTone={state === 'needs_repair' ? 'critical' : 'variant'}
      icon="link"
      trailing={here ? <Action status={status} app={app} /> : null}
    />
  );
}
