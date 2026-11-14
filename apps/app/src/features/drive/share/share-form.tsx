import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SwitchRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { END_OPTIONS, accessOptionsOf, type ShareDraft } from './share-model';

function Labelled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="variant">
        {label}
      </Text>
      {children}
    </View>
  );
}

export interface LinkFormProps {
  readonly draft: ShareDraft;
  readonly narrow: boolean;
  readonly disabled: boolean;
  readonly onDraft: (draft: ShareDraft) => void;
}

function Password({ draft, disabled, onDraft }: Omit<LinkFormProps, 'narrow'>): ReactNode {
  const asking = draft.password !== null;
  return (
    <View className="gap-2">
      <SwitchRow
        title="Ask for a password"
        value={asking}
        disabled={disabled}
        onChange={(on) => {
          onDraft({ ...draft, password: on ? '' : null });
        }}
      />
      {draft.password === null ? null : (
        <TextField
          label="Password"
          kind="password"
          value={draft.password}
          focusOnMount
          disabled={disabled}
          helper="People with the link type this before it opens"
          onChange={(password) => {
            onDraft({ ...draft, password });
          }}
        />
      )}
    </View>
  );
}

export function LinkForm({ draft, narrow, disabled, onDraft }: LinkFormProps): ReactNode {
  return (
    <View className="gap-3">
      <Labelled label="Link can">
        <Segmented
          options={accessOptionsOf(narrow)}
          value={draft.permission}
          label="Link can"
          fill={narrow}
          disabled={disabled}
          onChange={(permission) => {
            onDraft({ ...draft, permission });
          }}
        />
      </Labelled>
      <Labelled label="Ends">
        <Segmented
          options={END_OPTIONS}
          value={draft.end}
          label="Link ends"
          fill={narrow}
          compact={narrow}
          disabled={disabled}
          onChange={(end) => {
            onDraft({ ...draft, end });
          }}
        />
      </Labelled>
      <Password draft={draft} disabled={disabled} onDraft={onDraft} />
    </View>
  );
}
