import {
  ApiError,
  HUB_UPDATE_SOURCE_SAVE,
  type HubUpdateSourceSaved,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useSaveHubUpdateSource } from '../data/update-queries';

function saveError(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof ApiError && error.code === 'conflict')
    return 'Couldn’t save this branch. Try a different branch name or check for updates again.';
  return 'Couldn’t confirm the save. Retry with the same name to check the result.';
}

interface SaveBranchSheetProps {
  readonly branch: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onChange: (branch: string) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}

function SaveBranchSheet({
  branch,
  busy,
  disabled,
  error,
  onChange,
  onClose,
  onSave,
}: SaveBranchSheetProps): ReactNode {
  const valid = HUB_UPDATE_SOURCE_SAVE.shape.branch.safeParse(branch.trim()).success;
  return (
    <Sheet
      open
      title="Save changes to a branch"
      onClose={onClose}
      footer={
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button label="Cancel" variant="tonal" disabled={busy} onPress={onClose} />
          <Button
            label="Save branch"
            loading={busy}
            disabled={!valid || busy || disabled}
            onPress={onSave}
          />
        </View>
      }
    >
      <View className="gap-3">
        <Text variant="callout" tone="variant">
          Save a copy of your pending changes to a new local branch. Your checkout stays as it is.
        </Text>
        <TextField
          label="Branch name"
          value={branch}
          placeholder="wip/pending-hub-changes"
          kind="code"
          onChange={onChange}
          disabled={busy}
          error={error}
        />
      </View>
    </Sheet>
  );
}

interface SourceSaveActionProps {
  readonly offerId: string;
  readonly disabled: boolean;
  readonly onSaved: (saved: HubUpdateSourceSaved, requestId: string) => void;
}

export function SourceSaveAction({ offerId, disabled, onSaved }: SourceSaveActionProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const requests = useRef(new Map<string, string>());
  const save = useSaveHubUpdateSource();

  function saveBranch(): void {
    const checked = HUB_UPDATE_SOURCE_SAVE.shape.branch.safeParse(branch.trim());
    if (!checked.success || save.isPending || disabled) return;
    const requestId = requests.current.get(checked.data) ?? randomUUID();
    requests.current.set(checked.data, requestId);
    save.mutate(
      { offerId, requestId, branch: checked.data },
      {
        onSuccess: (saved) => {
          onSaved(saved, requestId);
          setOpen(false);
        },
      },
    );
  }

  return (
    <View className="items-start gap-2">
      <Button
        label="Save changes to a branch"
        variant="text"
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <SaveBranchSheet
          branch={branch}
          busy={save.isPending}
          disabled={disabled}
          error={saveError(save.error)}
          onChange={(name) => {
            setBranch(name);
            save.reset();
          }}
          onClose={() => {
            if (!save.isPending) setOpen(false);
          }}
          onSave={saveBranch}
        />
      ) : null}
    </View>
  );
}
