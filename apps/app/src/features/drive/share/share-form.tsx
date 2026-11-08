import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useDriveRoots } from '../../nas/data';
import { ProfileAvatar } from '../../profiles';
import {
  END_OPTIONS,
  accessOptionsOf,
  audienceOf,
  type Audience,
  type ShareDraft,
} from './share-model';

export function useAudience(item: Pick<DriveItem, 'rootId'>): Audience | null {
  const root = useDriveRoots().find((row) => row.id === item.rootId);
  const profiles = useProfiles();
  const viewerId = useActiveProfile()?.id ?? null;
  return root === undefined ? null : audienceOf(root, profiles, viewerId);
}

function Faces({ audience }: { readonly audience: Audience }): ReactNode {
  if (audience.people.length === 0) return null;
  return (
    <View className="flex-row">
      {audience.people.map((person, index) => (
        <View
          key={person.id}
          className={cn('rounded-full border-2 border-surface-raised', index > 0 && '-ml-2.5')}
        >
          <ProfileAvatar profile={person} />
        </View>
      ))}
    </View>
  );
}

export function WhoSees({ item }: { readonly item: Pick<DriveItem, 'rootId'> }): ReactNode {
  const audience = useAudience(item);
  if (audience === null) return null;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        People in the home
      </Text>
      <View className="flex-row items-center gap-3">
        <Faces audience={audience} />
        <Text variant="callout" numberOfLines={2} className="min-w-0 flex-1">
          {audience.line}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
          {audience.from}
        </Text>
      </View>
    </View>
  );
}

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
