import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import type { Extraction } from '@smarteverything/flow/extract/extract';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { Button } from '../../../../components/button';
import { notify, notifyFailure } from '../../../../components/toast-store';
import { Text } from '../../../../components/text';
import { useSelected } from '../../../../design/external-store';
import { useAutomationActions } from '../../data/use-automation';
import { useFunctionActions } from '../../data/use-functions';
import { selectIds } from '../../editor/host/edit-intents';
import type { DocumentStore } from '../../model/editor/document-store';
import { commitExtraction } from './commit';
import { extractBody, madeText, type Draft, type ExtractTarget } from './dialog-model';
import { MakeReusableDialog } from './make-reusable-dialog';
import type { TitleOf } from './plain-reference';
import { refusalView, type RefusalView } from './refusal-view';
import { useExtractPreview } from './use-extract-preview';

export interface MakeReusableInput {
  readonly store: DocumentStore;
  readonly checkContext: CheckContext;
  readonly titleOf: TitleOf;
  readonly target: ExtractTarget | null;
  readonly inSync: boolean;
  readonly onMade?: (made: { readonly instanceKey: string | null }) => void;
}

export interface MakeReusable {
  readonly unavailable: string | null;
  readonly refusal: RefusalView | null;
  readonly dialog: ReactNode;
  readonly press: () => void;
  readonly suggest: () => void;
}

export function unavailableReason(
  kind: 'automation' | 'function',
  target: ExtractTarget | null,
  inSync: boolean,
): string | null {
  if (kind !== 'automation') return 'Custom Nodes cannot be made inside another Custom Node yet.';
  if (target === null) return 'Save the automation first.';
  return inSync ? null : 'Publish your changes first, then make the Custom Node.';
}

interface Submitter {
  readonly busy: boolean;
  readonly failure: string | null;
  readonly made: boolean;
  readonly submit: (draft: Draft, keys: readonly string[], extraction: Extraction) => void;
  readonly clearFailure: () => void;
}

function useSubmit(input: MakeReusableInput): Submitter {
  const { store, target, onMade } = input;
  const functions = useFunctionActions();
  const automations = useAutomationActions();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [made, setMade] = useState(false);
  const submit: Submitter['submit'] = (draft, keys, extraction) => {
    const { program, layout } = store.state.get();
    const body = target === null ? null : extractBody(draft, keys, target, extraction);
    if (body === null || program.kind !== 'automation') {
      setFailure('That name cannot be used.');
      return;
    }
    setBusy(true);
    setFailure(null);
    commitExtraction({ functions, automations }, body, { program, layout }).then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setFailure(result.message);
          return;
        }
        setMade(true);
        onMade?.({ instanceKey: result.instanceKey });
        notify({
          message: madeText(draft.name),
          undo: () => {
            result.undo().then(undefined, notifyFailure('The Custom Node could not be undone.'));
          },
        });
      },
      (error: unknown) => {
        setBusy(false);
        notifyFailure('The Custom Node could not be made.')(error);
      },
    );
  };
  return {
    busy,
    failure,
    made,
    submit,
    clearFailure: (): void => {
      setFailure(null);
      setMade(false);
    },
  };
}

function selectKeys(store: MakeReusableInput['store'], keys: readonly string[]): void {
  const index = indexProgram(store.state.get().program);
  selectIds(
    store,
    keys.flatMap((key) => index.byKey.get(key)?.node.id ?? []),
  );
}

export function useMakeReusable(input: MakeReusableInput): MakeReusable {
  const { store, checkContext, titleOf, target, inSync } = input;
  const preview = useExtractPreview(store, checkContext);
  const kind = useSelected(store.state, (value) => value.program.kind);
  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
    preview.reset();
  };
  const { busy, failure, made, submit, clearFailure } = useSubmit(input);
  const { state } = preview;
  const unavailable = unavailableReason(kind, target, inSync);
  const refusal =
    state.status === 'refused'
      ? refusalView(state.refusal, store.state.get().program, state.keys, titleOf)
      : null;
  return {
    unavailable,
    refusal,
    press: (): void => {
      if (unavailable !== null) return;
      if (preview.run().status === 'ready') setOpen(true);
    },
    suggest: (): void => {
      selectKeys(store, refusal?.suggestion?.keys ?? []);
    },
    dialog:
      open && state.status === 'ready' ? (
        <MakeReusableDialog
          open
          extraction={state.preview}
          titleOf={titleOf}
          busy={busy}
          failure={failure}
          made={made}
          onCancel={() => {
            clearFailure();
            close();
          }}
          onSubmit={(draft) => {
            submit(draft, state.keys, state.preview);
          }}
        />
      ) : null,
  };
}

export function MakeReusableButton({ reusable }: { readonly reusable: MakeReusable }): ReactNode {
  return (
    <Button
      label="Make Custom Node"
      icon="box"
      variant="text"
      disabled={reusable.unavailable !== null}
      hint={reusable.unavailable ?? 'Turns the selected steps into a node you can use again'}
      onPress={reusable.press}
    />
  );
}

export function MakeReusableNote({ reusable }: { readonly reusable: MakeReusable }): ReactNode {
  const { refusal, unavailable, suggest } = reusable;
  const message = refusal?.message ?? unavailable;
  const suggestion = refusal?.suggestion ?? null;
  if (message === null) return null;
  return (
    <View className="items-center gap-2 px-4" accessibilityLiveRegion="polite">
      <Text variant="footnote" tone={refusal === null ? 'variant' : 'critical'} align="center">
        {message}
      </Text>
      {suggestion === null ? null : (
        <Button label={suggestion.label} variant="tonal" onPress={suggest} />
      )}
    </View>
  );
}
