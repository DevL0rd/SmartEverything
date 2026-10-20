import type { AutomationSecretEntry, AutomationSecretInput } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import {
  EMPTY_DRAFT,
  draftBody,
  draftIssues,
  replaceDraft,
  sheetCopy,
  type DraftIssues,
  type SecretDraft,
  type SheetCopy,
  type SecretRowModel,
} from './secrets-model';

export interface SecretSheetProps {
  readonly open: boolean;
  readonly replacing: SecretRowModel | null;
  readonly entries: readonly AutomationSecretEntry[];
  readonly onClose: () => void;
  readonly onSave: (body: AutomationSecretInput) => Promise<void>;
}

interface FormProps extends Omit<SecretSheetProps, 'open'> {
  readonly initial: SecretDraft;
}

interface FieldsProps {
  readonly draft: SecretDraft;
  readonly issues: DraftIssues;
  readonly copy: SheetCopy;
  readonly locked: boolean;
  readonly nameLocked: boolean;
  readonly failure: string | null;
  readonly onChange: (draft: SecretDraft) => void;
}

function Fields({
  draft,
  issues,
  copy,
  locked,
  nameLocked,
  failure,
  onChange,
}: FieldsProps): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        value={draft.name}
        disabled={nameLocked || locked}
        error={issues.name}
        helper="Shown in the Web request node. Use the same name to replace a value."
        focusOnMount={!nameLocked}
        onChange={(name) => {
          onChange({ ...draft, name });
        }}
      />
      <TextField
        label={copy.valueLabel}
        kind="password"
        value={draft.value}
        disabled={locked}
        error={issues.value}
        helper={copy.helper}
        focusOnMount={nameLocked}
        onChange={(value) => {
          onChange({ ...draft, value });
        }}
      />
      {failure === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      )}
    </View>
  );
}

function Form({ initial, replacing, entries, onClose, onSave }: FormProps): ReactNode {
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const copy = sheetCopy(draft, entries, replacing);
  const issues = draftIssues(draft, touched);
  const submit = (): void => {
    setTouched(true);
    const body = draftBody(draft);
    if (body === null) return;
    setBusy(true);
    setFailure(null);
    onSave(body).then(onClose, (error: unknown) => {
      setBusy(false);
      setFailure(error instanceof Error ? error.message : 'The secret could not be saved.');
    });
  };
  const footer = (
    <View className="flex-row gap-2">
      <Button label="Cancel" variant="text" onPress={onClose} disabled={busy} />
      <Button label={copy.submit} icon="lock" grow loading={busy} onPress={submit} />
    </View>
  );
  return (
    <Sheet open title={copy.title} onClose={onClose} footer={footer} detents={['half', 'full']}>
      <Fields
        draft={draft}
        issues={issues}
        copy={copy}
        locked={busy}
        nameLocked={replacing !== null}
        failure={failure}
        onChange={setDraft}
      />
    </Sheet>
  );
}

export function SecretSheet({ open, replacing, ...rest }: SecretSheetProps): ReactNode {
  if (!open) return null;
  const initial = replacing === null ? EMPTY_DRAFT : replaceDraft(replacing);
  return <Form key={replacing?.id ?? 'new'} initial={initial} replacing={replacing} {...rest} />;
}
