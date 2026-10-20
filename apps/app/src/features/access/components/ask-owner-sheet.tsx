import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AccessRequestKind, NewAccessRequest } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMutationState, type MutationState } from '../../../store/mutation';
import type { RequestActions } from '../data/access-data';
import { REQUEST_KIND_LABEL, REQUEST_KIND_ORDER } from '../model/requests';
import { usdOf } from '../model/scopes';
import { AreaPick, PlacePick } from './request-picks';

const KINDS = REQUEST_KIND_ORDER.map((kind) => ({ value: kind, label: REQUEST_KIND_LABEL[kind] }));

function targetField(kind: AccessRequestKind, chosen: string | null, text: string): string | null {
  if (kind === 'model') {
    return text.trim() === '' ? null : text.trim();
  }
  if (kind === 'budget') {
    const usd = usdOf(text);
    return usd.kind === 'amount' ? String(usd.usd) : null;
  }
  return chosen;
}

function TargetInput({
  kind,
  chosen,
  onChoose,
  text,
  onText,
}: {
  readonly kind: AccessRequestKind;
  readonly chosen: string | null;
  readonly onChoose: (value: string) => void;
  readonly text: string;
  readonly onText: (value: string) => void;
}): ReactNode {
  switch (kind) {
    case 'area':
      return <AreaPick value={chosen} onChange={onChoose} />;
    case 'device':
      return <PlacePick value={chosen} onChange={onChoose} />;
    case 'model':
      return <TextField label="Model" value={text} onChange={onText} kind="code" />;
    case 'budget':
      return <TextField label="Extra dollars" value={text} onChange={onText} kind="number" />;
  }
}

function AskFooter({
  request,
  actions,
  onClose,
  mutation,
}: {
  readonly request: NewAccessRequest;
  readonly actions: RequestActions;
  readonly onClose: () => void;
  readonly mutation: MutationState;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label="Send"
        loading={mutation.busy}
        disabled={request.target === null}
        onPress={() => {
          mutation.run(() => actions.ask(request), {
            failure: 'The request was not sent',
            inline: true,
            onDone: onClose,
          });
        }}
      />
    </>
  );
}

export function AskOwnerSheet({
  actions,
  onClose,
}: {
  readonly actions: RequestActions;
  readonly onClose: () => void;
}): ReactNode {
  const [kind, setKind] = useState<AccessRequestKind>('area');
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const mutation = useMutationState();
  const request: NewAccessRequest = {
    kind,
    target: targetField(kind, chosen, text),
    note: note.trim(),
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Ask the owner"
      footer={
        <AskFooter request={request} actions={actions} onClose={onClose} mutation={mutation} />
      }
    >
      <Text variant="callout" tone="variant">
        The owner is told right away and can say yes for good or for a while.
      </Text>
      <SelectRow<AccessRequestKind>
        title="What for"
        options={KINDS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setChosen(null);
          setText('');
        }}
      />
      <TargetInput kind={kind} chosen={chosen} onChoose={setChosen} text={text} onText={setText} />
      <TextField label="Why (optional)" value={note} onChange={setNote} multiline />
      {mutation.problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {mutation.problem}
        </Text>
      )}
    </Sheet>
  );
}
