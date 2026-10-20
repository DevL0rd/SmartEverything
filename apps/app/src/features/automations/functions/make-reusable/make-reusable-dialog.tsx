import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Extraction } from '@smarteverything/flow/extract/extract';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { useMotion } from '../../../../design/motion';
import { collapseEntering } from './collapse-motion';
import {
  KIND_TEXT,
  editPort,
  initialDraft,
  madeText,
  nameIssue,
  setName,
  toggleExpose,
  type Draft,
} from './dialog-model';
import { FixedRefs } from './fixed-refs';
import { interfaceRows, type InterfaceRows } from './interface-rows';
import type { TitleOf } from './plain-reference';
import { InputRows, OutputRows, type PortEdit } from './port-rows';
import { PreviewCard } from './preview-card';

export interface MakeReusableDialogProps {
  readonly open: boolean;
  readonly extraction: Extraction;
  readonly titleOf: TitleOf;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly made: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (draft: Draft) => void;
}

function Block({
  title,
  caption,
  children,
}: {
  readonly title: string;
  readonly caption: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="body-strong" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="footnote" tone="variant">
        {caption}
      </Text>
      {children}
    </View>
  );
}

function Footer({
  busy,
  onCancel,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button label="Cancel" variant="text" onPress={onCancel} disabled={busy} />
      <Button label="Make Custom Node" icon="box" grow loading={busy} onPress={onSubmit} />
    </View>
  );
}

function MadeView({
  draft,
  extraction,
  rows,
}: {
  readonly draft: Draft;
  readonly extraction: Extraction;
  readonly rows: InterfaceRows;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View entering={collapseEntering(motion)} className="gap-3">
      <PreviewCard name={draft.name} flavour={extraction.callee.flavour} rows={rows} />
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        {madeText(draft.name)}
      </Text>
    </Animated.View>
  );
}

function NameBlock({
  name,
  error,
  flavour,
  onChange,
}: {
  readonly name: string;
  readonly error: string | null;
  readonly flavour: Extraction['callee']['flavour'];
  readonly onChange: (name: string) => void;
}): ReactNode {
  return (
    <>
      <TextField label="Name" value={name} error={error} focusOnMount onChange={onChange} />
      <Text variant="footnote" tone="variant">
        {KIND_TEXT[flavour]}
      </Text>
    </>
  );
}

function Empty({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="faint" className="py-2">
      {text}
    </Text>
  );
}

function Interface({
  rows,
  draft,
  onEdit,
}: {
  readonly rows: InterfaceRows;
  readonly draft: Draft;
  readonly onEdit: PortEdit;
}): ReactNode {
  return (
    <>
      <Block title="Inputs" caption="What the steps read from the rest of the automation.">
        {rows.inputs.length === 0 ? (
          <Empty text="Nothing comes in." />
        ) : (
          <InputRows rows={rows.inputs} draft={draft} onEdit={onEdit} />
        )}
      </Block>
      <Block title="Outputs" caption="What later steps use from these ones.">
        {rows.outputs.length === 0 ? (
          <Empty text="Nothing is used later." />
        ) : (
          <OutputRows rows={rows.outputs} draft={draft} onEdit={onEdit} />
        )}
      </Block>
      <Block title="Exits" caption="How the node can finish.">
        <Text variant="body">{rows.exits.join(', ')}</Text>
      </Block>
    </>
  );
}

function FormBody({
  draft,
  extraction,
  titleOf,
  rows,
  touched,
  failure,
  setDraft,
}: {
  readonly draft: Draft;
  readonly extraction: Extraction;
  readonly titleOf: TitleOf;
  readonly rows: InterfaceRows;
  readonly touched: boolean;
  readonly failure: string | null;
  readonly setDraft: Dispatch<SetStateAction<Draft>>;
}): ReactNode {
  const edit: PortEdit = (side, port, change) => {
    setDraft((current) => editPort(current, side, port, change));
  };
  return (
    <View className="gap-4">
      <PreviewCard name={draft.name} flavour={extraction.callee.flavour} rows={rows} />
      <NameBlock
        name={draft.name}
        error={touched ? nameIssue(draft) : null}
        flavour={extraction.callee.flavour}
        onChange={(name) => {
          setDraft((current) => setName(current, name));
        }}
      />
      <Interface rows={rows} draft={draft} onEdit={edit} />
      <FixedRefs
        fixed={extraction.fixed}
        titleOf={titleOf}
        expose={draft.expose}
        onToggle={(id, on) => {
          setDraft((current) => toggleExpose(current, id, on));
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

export function MakeReusableDialog({
  open,
  extraction,
  titleOf,
  busy,
  failure,
  made,
  onCancel,
  onSubmit,
}: MakeReusableDialogProps): ReactNode {
  const [draft, setDraft] = useState(() => initialDraft(extraction));
  const [touched, setTouched] = useState(false);
  const rows = useMemo(() => interfaceRows(extraction, titleOf), [extraction, titleOf]);
  const issue = nameIssue(draft);
  const submit = (): void => {
    setTouched(true);
    if (issue === null) onSubmit(draft);
  };
  return (
    <Sheet
      open={open}
      title="Make a Custom Node"
      onClose={onCancel}
      footer={
        made ? (
          <Button label="Done" grow onPress={onCancel} />
        ) : (
          <Footer busy={busy} onCancel={onCancel} onSubmit={submit} />
        )
      }
      wide
    >
      {made ? (
        <MadeView draft={draft} extraction={extraction} rows={rows} />
      ) : (
        <FormBody
          draft={draft}
          extraction={extraction}
          titleOf={titleOf}
          rows={rows}
          touched={touched}
          failure={failure}
          setDraft={setDraft}
        />
      )}
    </Sheet>
  );
}
