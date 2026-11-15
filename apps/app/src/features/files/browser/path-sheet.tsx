import { useState, type ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import type { FileBrowserHandle } from './browser-types';

const NOT_A_PATH = 'Type a full path, such as /home or C:\\Users.';

export function PathSheet<O>({
  browser,
  onClose,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly onClose: () => void;
}): ReactNode {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (): void => {
    const location = browser.source.locationOf(text);
    if (location === null) {
      setProblem(NOT_A_PATH);
      return;
    }
    onClose();
    browser.commands.openLocation(location);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Go to a folder"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Open" disabled={text.trim() === ''} onPress={submit} />
        </>
      }
    >
      <TextField
        label="Path"
        value={text}
        onChange={(next) => {
          setText(next);
          setProblem(null);
        }}
        onSubmit={submit}
        helper={`A folder on ${browser.source.label}`}
        error={problem}
        focusOnMount
      />
    </Sheet>
  );
}
