import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Segmented } from '../../../../components/segmented';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import type { FunctionCreateBody } from '../../data/api';
import { KIND_OPTIONS, nameIssue, newNodeRequest, type NewNodeKind } from './new-node-model';

export interface NewNodeDialogProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onCreate: (request: FunctionCreateBody) => Promise<void>;
}

interface Creation {
  readonly busy: boolean;
  readonly failure: string | null;
  readonly submit: (request: FunctionCreateBody) => void;
}

function useCreation(onCreate: NewNodeDialogProps['onCreate']): Creation {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const submit = (request: FunctionCreateBody): void => {
    setBusy(true);
    setFailure(null);
    onCreate(request)
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : 'It could not be created.');
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, failure, submit };
}

function Form({ onCancel, onCreate }: Omit<NewNodeDialogProps, 'open'>): ReactNode {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<NewNodeKind>('step');
  const [touched, setTouched] = useState(false);
  const creation = useCreation(onCreate);
  const issue = nameIssue(name);
  const explanation = KIND_OPTIONS.find((option) => option.value === kind)?.explanation ?? '';
  const submit = (): void => {
    setTouched(true);
    if (issue === null) creation.submit(newNodeRequest(name, kind));
  };
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        value={name}
        focusOnMount
        error={touched ? issue : null}
        onSubmit={submit}
        onChange={setName}
      />
      <Segmented<NewNodeKind>
        label="Kind"
        fill
        options={KIND_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={kind}
        onChange={setKind}
      />
      <Text variant="footnote" tone="variant">
        {explanation}
      </Text>
      {creation.failure === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {creation.failure}
        </Text>
      )}
      <View className="flex-row items-center justify-end gap-2">
        <Button label="Cancel" variant="text" disabled={creation.busy} onPress={onCancel} />
        <Button label="Create" loading={creation.busy} onPress={submit} />
      </View>
    </View>
  );
}

export function NewNodeDialog({ open, onCancel, onCreate }: NewNodeDialogProps): ReactNode {
  return (
    <Sheet open={open} onClose={onCancel} title="New Custom Node" detents={['half']}>
      {open ? <Form onCancel={onCancel} onCreate={onCreate} /> : null}
    </Sheet>
  );
}
