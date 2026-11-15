import { useState, type ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { nameProblemOf, nameReadyOf } from './name-model';

export interface NameSheetProps {
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly helper: string;
  readonly confirmLabel: string;
  readonly taken: ReadonlySet<string>;
  readonly onSubmit: (name: string) => void;
  readonly onClose: () => void;
}

export function NameSheet(props: NameSheetProps): ReactNode {
  const { initial, taken, onSubmit, onClose } = props;
  const [text, setText] = useState(initial);
  const ready = nameReadyOf(text, initial, taken);
  const submit = (): void => {
    if (!ready) return;
    onSubmit(text.trim());
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={props.title}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label={props.confirmLabel} disabled={!ready} onPress={submit} />
        </>
      }
    >
      <TextField
        label={props.label}
        value={text}
        onChange={setText}
        onSubmit={submit}
        helper={props.helper}
        error={nameProblemOf(text, initial, taken)}
        focusOnMount
      />
    </Sheet>
  );
}
