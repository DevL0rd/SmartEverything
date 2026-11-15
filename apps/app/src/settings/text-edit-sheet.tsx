import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../components/button';
import { Sheet } from '../components/sheet';
import { TextField, type FieldKind } from '../components/text-field';
import { useIdiom } from '../design/platform';
import { useMutationState, type MutationState } from '../store/mutation';

export interface TextEditRequest {
  readonly id?: string;
  readonly opener?: RefObject<View | null> | undefined;
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly placeholder: string;
  readonly confirmLabel: string;
  readonly maxLength: number;
  readonly kind?: FieldKind;
  readonly allowEmpty?: boolean;
  readonly multiline?: boolean;
  readonly helper?: string;
  readonly problemOf?: (value: string) => string | null;
  readonly save: (value: string) => Promise<void>;
  readonly reset?: TextEditReset;
}

export interface TextEditReset {
  readonly label: string;
  readonly spoken: string;
  readonly run: () => Promise<unknown>;
}

function Footer({
  label,
  busy,
  ready,
  reset,
  onSubmit,
  onReset,
  onClose,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly reset: TextEditReset | undefined;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <>
      {reset === undefined ? null : (
        <View className="mr-auto">
          <Button
            label={reset.label}
            spoken={reset.spoken}
            variant="text"
            disabled={busy}
            onPress={onReset}
          />
        </View>
      )}
      {touch ? <Button label="Cancel" variant="text" onPress={onClose} /> : null}
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
  readonly resetNow: () => void;
  readonly mutation: MutationState;
}

function useEditor(request: TextEditRequest, onClose: () => void): EditorState {
  const [value, setValue] = useState(request.initial);
  const mutation = useMutationState();
  const trimmed = value.trim();
  const invalid = problemOf(request, trimmed);
  const ready =
    (trimmed !== '' || request.allowEmpty === true) &&
    trimmed !== request.initial &&
    invalid === null;
  const submit = (): void => {
    if (ready) {
      mutation.run(() => request.save(trimmed), {
        failure: request.title,
        inline: true,
        onDone: onClose,
      });
    }
  };
  const resetNow = (): void => {
    const reset = request.reset;
    if (reset !== undefined) {
      mutation.run(reset.run, { failure: request.title, inline: true, onDone: onClose });
    }
  };
  return { value, setValue, invalid, ready, submit, resetNow, mutation };
}

function Editor({
  request,
  onClose,
}: {
  readonly request: TextEditRequest;
  readonly onClose: () => void;
}): ReactNode {
  const { value, setValue, invalid, ready, submit, resetNow, mutation } = useEditor(
    request,
    onClose,
  );
  return (
    <Sheet
      subpage={request.opener === undefined ? true : { opener: request.opener }}
      open
      onClose={onClose}
      title={request.title}
      detents={['fit']}
      footer={
        <Footer
          label={request.confirmLabel}
          busy={mutation.busy}
          ready={ready}
          reset={request.reset}
          onSubmit={submit}
          onReset={resetNow}
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
        multiline={request.multiline === true}
        {...(request.helper === undefined ? {} : { helper: request.helper })}
        focusOnMount
      />
    </Sheet>
  );
}

export function editorKeyOf(request: TextEditRequest): string {
  return request.id ?? request.title;
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
  return <Editor key={editorKeyOf(request)} request={request} onClose={onClose} />;
}
