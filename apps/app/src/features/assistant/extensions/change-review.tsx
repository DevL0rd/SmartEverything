import type { ReactNode } from 'react';
import type { HarnessDesiredConfiguration } from '@smarteverything/domain';
import { useState } from 'react';
import { Banner } from '../../../components/banner';
import { Sheet } from '../../../components/sheet';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { selectedEntry, selectionSummary, type ExtensionChange } from './selection';
import type { ExtensionChangeState, useExtensionWriter } from './change';

type Review = Extract<ExtensionChangeState, { kind: 'review' }>;
type Writer = ReturnType<typeof useExtensionWriter>;

function intentLabel(change: ExtensionChange): string {
  if (change.kind === 'switch') return change.enabled ? 'Turn on' : 'Turn off';
  if (change.kind === 'setting')
    return typeof change.value === 'boolean'
      ? `${change.value ? 'Turn on' : 'Turn off'} ${change.label}`
      : `Set ${change.label} to ${JSON.stringify(change.value)}`;
  return change.kind === 'install'
    ? 'Add the inspected version'
    : 'Remove from the shared selection';
}

function ReviewFooter({
  writer,
  state,
  close,
}: {
  readonly writer: Writer;
  readonly state: Review;
  readonly close: () => void;
}): ReactNode {
  return (
    <>
      <Button
        label="Keep current"
        variant="text"
        onPress={() => {
          writer.dismiss();
          close();
        }}
      />
      <Button
        label="Apply my change"
        disabled={!writer.allowed}
        onPress={() => {
          close();
          void writer.save(state.change, state.current);
        }}
      />
    </>
  );
}

function ReviewBody({ state }: { readonly state: Review }): ReactNode {
  return (
    <>
      <Text>{state.change.item.name}</Text>
      <Text variant="callout" tone="variant">
        Previously: {reviewedSelection(state.change, state.before)}
      </Text>
      <Text variant="callout" tone="variant">
        Now: {reviewedSelection(state.change, state.current)}
      </Text>
      <Text variant="callout">Your change: {intentLabel(state.change)}</Text>
      <Text variant="footnote" tone="variant">
        Other extensions and skills keep their latest changes.
      </Text>
    </>
  );
}

export function ExtensionChangeReview({ writer }: { readonly writer: Writer }): ReactNode {
  const [open, setOpen] = useState(false);
  const state = writer.state;
  const close = (): void => {
    setOpen(false);
  };
  if (state.kind === 'problem') return <Banner tone="warning" title={state.message} />;
  if (state.kind !== 'review') return null;
  return (
    <>
      <Banner
        tone="warning"
        title={state.title}
        body={state.message}
        wrapBody
        action={{
          label: 'Review changes',
          onPress: () => {
            setOpen(true);
          },
        }}
      />
      <Sheet
        open={open}
        onClose={close}
        title="Review changes"
        detents={['fit']}
        footer={<ReviewFooter writer={writer} state={state} close={close} />}
      >
        <ReviewBody state={state} />
      </Sheet>
    </>
  );
}

function reviewedSelection(change: ExtensionChange, desired: HarnessDesiredConfiguration): string {
  if (change.kind !== 'setting') return selectionSummary(change.item, desired);
  const saved = selectedEntry(change.item, desired)?.config[change.key];
  const value = saved === undefined ? change.defaultValue : saved;
  return `${change.label}: ${value === true ? 'On' : value === false ? 'Off' : JSON.stringify(value)}`;
}
