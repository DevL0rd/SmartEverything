import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '../components/button';
import { Sheet } from '../components/sheet';
import { TextField, type FieldKind } from '../components/text-field';
import { useMutationState, type MutationState } from '../store/mutation';

export interface TextEditRequest {
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly placeholder: string;
  readonly confirmLabel: string;
  readonly maxLength: number;
  readonly kind?: FieldKind;
  readonly helper?: string;
  readonly problemOf?: (value: string) => string | null;
  readonly save: (value: string) => Promise<void>;
}

function Footer({
  label,
  busy,
  ready,
  onSubmit,
  onClose,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button label={label} loading={busy} disabled={!ready} onPress={onSubmit} />
    </>
  );
}

function problemOf(request: TextEditRequest, trimmed: string): string | null {
  if (trimmed.length > request.maxLength) {
    return `Use ${String(request.maxLength)} characters or fewer`;
  }
  return trimmed === '' ? null : (request.problemOf?.(trimmed) ?? null);
}

interface EditorState {
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly invalid: string | null;
  readonly ready: boolean;
  readonly submit: () => void;
  readonly mutation: MutationState;
}

function useEditor(request: TextEditRequest, onClose: () => void): EditorState {
  const [value, setValue] = useState(request.initial);
  const mutation = useMutationState();
  const trimmed = value.trim();
  const invalid = problemOf(request, trimmed);
  const ready = trimmed !== '' && trimmed !== request.initial && invalid === null;
  const submit = (): void => {
    if (ready) {
      mutation.run(() => request.save(trimmed), {
        failure: request.title,
        inline: true,
        onDone: onClose,
      });
    }
  };
  return { value, setValue, invalid, ready, submit, mutation };
}

function Editor({
  request,
  onClose,
}: {
  readonly request: TextEditRequest;
  readonly onClose: () => void;
}): ReactNode {
  const { value, setValue, invalid, ready, submit, mutation } = useEditor(request, onClose);
  return (
    <Sheet
      open
      onClose={onClose}
      title={request.title}
      detents={['fit']}
      footer={
        <Footer
          label={request.confirmLabel}
          busy={mutation.busy}
          ready={ready}
          onSubmit={submit}
          onClose={onClose}
        />
      }
    >
      <TextField
        label={request.label}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        placeholder={request.placeholder}
        error={invalid ?? mutation.problem}
        kind={request.kind ?? 'text'}
        {...(request.helper === undefined ? {} : { helper: request.helper })}
        focusOnMount
      />
    </Sheet>
  );
}

export function TextEditSheet({
  request,
  onClose,
}: {
  readonly request: TextEditRequest | null;
  readonly onClose: () => void;
}): ReactNode {
  if (request === null) {
    return null;
  }
  return <Editor key={request.title + request.initial} request={request} onClose={onClose} />;
}
