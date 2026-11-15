import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { DateNav } from '../../../components/date-nav';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { localDayKey } from '../../../format/time';
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
  { value: 'all', label: 'All rules', icon: 'listCheck' },
  { value: 'any', label: 'Any rule', icon: 'list' },
];

const MEDIA: readonly SegmentedOption<MediaChoice>[] = [
  { value: 'photos', label: 'Photos', icon: 'image' },
  { value: 'videos', label: 'Videos', icon: 'film' },
  { value: 'both', label: 'Both' },
];

const TEXT_LABEL = { camera: 'Camera has', lens: 'Lens has', name: 'Name has' } as const;

type Edit = (row: RuleRow) => void;

export function FieldGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      {children}
    </View>
  );
}

function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

function DayChoice({
  label,
  day,
  onDay,
}: {
  readonly label: string;
  readonly day: string;
  readonly onDay: (day: string) => void;
}): ReactNode {
  const open = day === '';
  return (
    <View className="min-w-40 flex-1">
      <FieldGroup label={label}>
        <View className="min-h-control-h flex-row flex-wrap items-center gap-1">
          {open ? (
            <Button
              label="Any day"
              icon="calendar"
              variant="outlined"
              onPress={() => {
                onDay(localDayKey(new Date()));
              }}
            />
          ) : (
            <>
              <DateNav
                value={dayDate(day)}
                range="day"
                withYear
                onChange={(date) => {
                  onDay(localDayKey(date));
                }}
              />
              <IconButton
                icon="close"
                label={`Clear ${label.toLowerCase()} day`}
                onPress={() => {
                  onDay('');
                }}
              />
            </>
          )}
        </View>
      </FieldGroup>
    </View>
  );
}

function TakenFields({
  row,
  onEdit,
}: {
  readonly row: Extract<RuleRow, { readonly field: 'taken' }>;
  readonly onEdit: Edit;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      <DayChoice
        label="From"
        day={row.from}
        onDay={(from) => {
          onEdit({ ...row, from });
        }}
      />
      <DayChoice
        label="To"
        day={row.to}
        onDay={(to) => {
          onEdit({ ...row, to });
        }}
      />
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
      <FieldGroup label="Match">
        <Segmented
          options={MATCHES}
          value={draft.match}
          label="Match"
          size="control"
          onChange={(match) => {
            onDraft({ ...draft, match });
          }}
        />
      </FieldGroup>
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
