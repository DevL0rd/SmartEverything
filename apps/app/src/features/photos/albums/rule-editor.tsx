import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { leafIcon, leafText } from './model';
import {
  addRow,
  removeRow,
  replaceRow,
  retypeRow,
  RULE_FIELDS,
  type AlbumDraft,
  type MediaChoice,
  type RuleRow,
} from './rule-draft';

const MATCHES: readonly SegmentedOption<AlbumDraft['match']>[] = [
  { value: 'all', label: 'All rules' },
  { value: 'any', label: 'Any rule' },
];

const MEDIA: readonly SegmentedOption<MediaChoice>[] = [
  { value: 'photos', label: 'Photos', icon: 'image' },
  { value: 'videos', label: 'Videos', icon: 'film' },
  { value: 'both', label: 'Both' },
];

const TEXT_LABEL = { camera: 'Camera has', lens: 'Lens has', name: 'Name has' } as const;

const DAY_HINT = 'Year, month and day, like 2026-11-03';

type Edit = (row: RuleRow) => void;

function TakenFields({
  row,
  onEdit,
}: {
  readonly row: Extract<RuleRow, { readonly field: 'taken' }>;
  readonly onEdit: Edit;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <View className="min-w-32 flex-1">
        <TextField
          label="From"
          value={row.from}
          placeholder="2026-11-03"
          helper={DAY_HINT}
          onChange={(from) => {
            onEdit({ ...row, from });
          }}
        />
      </View>
      <View className="min-w-32 flex-1">
        <TextField
          label="To"
          value={row.to}
          placeholder="2026-11-07"
          onChange={(to) => {
            onEdit({ ...row, to });
          }}
        />
      </View>
    </View>
  );
}

function RowValue({ row, onEdit }: { readonly row: RuleRow; readonly onEdit: Edit }): ReactNode {
  switch (row.field) {
    case 'kind':
      return (
        <Segmented
          options={MEDIA}
          value={row.media}
          label="Kind is"
          size="control"
          onChange={(media) => {
            onEdit({ ...row, media });
          }}
        />
      );
    case 'taken':
      return <TakenFields row={row} onEdit={onEdit} />;
    case 'favourite':
      return (
        <Text variant="callout" tone="variant">
          Only photos and videos marked as favourite
        </Text>
      );
    case 'kept':
      return null;
    case 'camera':
    case 'lens':
    case 'name':
      return (
        <TextField
          label={TEXT_LABEL[row.field]}
          value={row.contains}
          showLabel={false}
          placeholder={TEXT_LABEL[row.field]}
          onChange={(contains) => {
            onEdit({ ...row, contains });
          }}
        />
      );
  }
}

function RowField({
  row,
  onRetype,
}: {
  readonly row: RuleRow;
  readonly onRetype: (field: (typeof RULE_FIELDS)[number]['value']) => void;
}): ReactNode {
  if (row.field === 'kept') {
    return (
      <View className="min-h-control-h flex-1 flex-row items-center gap-2">
        <Icon name={leafIcon(row.leaf)} size={16} tone="variant" />
        <Text variant="callout" numberOfLines={2} className="flex-1">
          {leafText(row.leaf)}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-1">
      <Select
        label="Rule"
        options={RULE_FIELDS}
        value={row.field}
        showLabel={false}
        onChange={onRetype}
      />
    </View>
  );
}

function RuleRowView({
  row,
  draft,
  onDraft,
}: {
  readonly row: RuleRow;
  readonly draft: AlbumDraft;
  readonly onDraft: (draft: AlbumDraft) => void;
}): ReactNode {
  const edit: Edit = (next) => {
    onDraft(replaceRow(draft, next));
  };
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-2">
      <View className="flex-row items-center gap-2">
        <RowField
          row={row}
          onRetype={(field) => {
            onDraft(retypeRow(draft, row.key, field));
          }}
        />
        <IconButton
          icon="close"
          label="Remove rule"
          disabled={draft.rows.length === 1}
          onPress={() => {
            onDraft(removeRow(draft, row.key));
          }}
        />
      </View>
      <RowValue row={row} onEdit={edit} />
    </View>
  );
}

export function SmartRuleEditor({
  draft,
  onDraft,
}: {
  readonly draft: AlbumDraft;
  readonly onDraft: (draft: AlbumDraft) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="callout">Match</Text>
        <Segmented
          options={MATCHES}
          value={draft.match}
          label="Match"
          size="control"
          onChange={(match) => {
            onDraft({ ...draft, match });
          }}
        />
      </View>
      {draft.rows.map((row) => (
        <RuleRowView key={row.key} row={row} draft={draft} onDraft={onDraft} />
      ))}
      <View className="flex-row">
        <Button
          label="Add rule"
          icon="plus"
          variant="text"
          onPress={() => {
            onDraft(addRow(draft));
          }}
        />
      </View>
    </View>
  );
}
