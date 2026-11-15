import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { nameProblemOf, nameReadyOf } from '../transfer/name-model';
import type { FileLocation } from '../source/types';
import type { ChoiceView } from './picker-model';

export type PickerExtra = 'none' | 'path' | 'folder';

function PathField({
  locationOf,
  onGo,
}: {
  readonly locationOf: (typed: string) => FileLocation | null;
  readonly onGo: (location: FileLocation) => void;
}): ReactNode {
  const [text, setText] = useState('');
  const location = text.trim() === '' ? null : locationOf(text.trim());
  const submit = (): void => {
    if (location !== null) onGo(location);
  };
  return (
    <View className="gap-2">
      <TextField
        label="Folder path"
        value={text}
        onChange={setText}
        onSubmit={submit}
        helper="Type the full path of a folder."
        error={text.trim() === '' || location !== null ? null : 'That isn’t a folder path here.'}
        focusOnMount
      />
      <Button label="Go to path" variant="tonal" disabled={location === null} onPress={submit} />
    </View>
  );
}

function NewFolderField({
  folder,
  taken,
  onCreate,
}: {
  readonly folder: string;
  readonly taken: ReadonlySet<string>;
  readonly onCreate: (name: string) => void;
}): ReactNode {
  const [text, setText] = useState('');
  const ready = nameReadyOf(text, '', taken);
  const submit = (): void => {
    if (ready) onCreate(text.trim());
  };
  return (
    <View className="gap-2">
      <TextField
        label="New folder name"
        value={text}
        onChange={setText}
        onSubmit={submit}
        helper={`Created inside ${folder}`}
        error={nameProblemOf(text, '', taken)}
        focusOnMount
      />
      <Button label="Create and open" variant="tonal" disabled={!ready} onPress={submit} />
    </View>
  );
}

export interface PickerFooterProps<O> {
  readonly view: ChoiceView<O>;
  readonly folder: string;
  readonly taken: ReadonlySet<string>;
  readonly canCreate: boolean;
  readonly locationOf: ((typed: string) => FileLocation | null) | null;
  readonly compact: boolean;
  readonly extra: PickerExtra;
  readonly onExtra: (next: PickerExtra) => void;
  readonly onGo: (location: FileLocation) => void;
  readonly onCreate: (name: string) => void;
  readonly onChoose: () => void;
  readonly onCancel: (() => void) | undefined;
}

function Extra<O>({ footer }: { readonly footer: PickerFooterProps<O> }): ReactNode {
  const { extra, locationOf, onExtra } = footer;
  if (extra === 'path' && locationOf !== null) {
    return (
      <PathField
        locationOf={locationOf}
        onGo={(location) => {
          footer.onGo(location);
          onExtra('none');
        }}
      />
    );
  }
  if (extra === 'folder' && footer.canCreate) {
    return (
      <NewFolderField
        folder={footer.folder}
        taken={footer.taken}
        onCreate={(name) => {
          footer.onCreate(name);
          onExtra('none');
        }}
      />
    );
  }
  return null;
}

function Secondary<O>({ footer }: { readonly footer: PickerFooterProps<O> }): ReactNode {
  const { extra, onExtra } = footer;
  const toggle = (next: PickerExtra) => (): void => {
    onExtra(extra === next ? 'none' : next);
  };
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {footer.canCreate ? (
        <Button label="New folder" variant="outlined" icon="plus" onPress={toggle('folder')} />
      ) : null}
      {footer.locationOf === null ? null : (
        <Button
          label={extra === 'path' ? 'Browse' : 'Enter path'}
          variant="text"
          onPress={toggle('path')}
        />
      )}
      {footer.onCancel === undefined ? null : (
        <Button label="Cancel" variant="text" onPress={footer.onCancel} />
      )}
    </View>
  );
}

export function PickerFooter<O>(footer: PickerFooterProps<O>): ReactNode {
  const { view, compact } = footer;
  return (
    <View
      className={cn(
        'gap-2 border-t border-outline-variant',
        compact ? 'px-1.5 pb-1 pt-2' : 'px-4 pb-3 pt-2.5',
      )}
    >
      <Text variant="footnote" tone="variant" numberOfLines={2} selectable>
        {view.summary}
      </Text>
      {view.reason === null ? null : <ReasonLine icon="lock" tone="warning" text={view.reason} />}
      <Extra key={footer.extra} footer={footer} />
      <View className="flex-row">
        <Button
          label={view.label}
          size={compact ? 'md' : 'lg'}
          grow
          disabled={view.choice === null}
          onPress={footer.onChoose}
        />
      </View>
      <Secondary footer={footer} />
    </View>
  );
}
