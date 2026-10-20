import type { ReactNode } from 'react';
import { useState } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useMinute } from '../../../store/clock';
import { useAccessRequests, useRequestActions } from '../data/access-data';
import { useRequestNames } from '../data/request-names';
import { requestStatusText, targetText } from '../model/requests';
import { AskOwnerSheet } from './ask-owner-sheet';

function MyRequests(): ReactNode {
  const requests = useAccessRequests();
  const names = useRequestNames();
  const now = useMinute();
  const rows = requests.data ?? [];
  if (rows.length === 0) {
    return null;
  }
  return (
    <List title="Your requests" inset>
      {rows.map((request) => (
        <ListRow
          key={request.id}
          title={targetText(request, names)}
          subtitle={requestStatusText(request, now)}
          wrapSubtitle
          icon="key"
        />
      ))}
    </List>
  );
}

export function MemberAccess(): ReactNode {
  const [open, setOpen] = useState(false);
  const actions = useRequestActions();
  return (
    <>
      <List footer="Ask when something is refused. The owner decides.">
        <ListRow
          title="Ask the owner for more"
          subtitle="A part of the app, a device, an AI model or more AI budget"
          wrapSubtitle
          icon="key"
          chevron
          onPress={() => {
            setOpen(true);
          }}
        />
      </List>
      <MyRequests />
      {open ? (
        <AskOwnerSheet
          actions={actions}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
