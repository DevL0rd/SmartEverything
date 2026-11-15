import type { PlannerImportResult } from '@smarteverything/domain';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { ColourSwatches } from '../../../components/colour-swatches';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { SelectRow } from '../../../components/rows';
import { useSheetReveal } from '../../../components/sheet-body';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useMinuteOf } from '../../../store/clock';
import { useHolidayRegions, usePlannerFeeds } from '../data/feeds';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { COLOUR_OPTIONS, NONE, beforeText, reminderOptions } from '../settings/options';
import { useCalendarActions } from './calendar-actions';
import { mayChangeLook, useCalendarEdit, useCalendarLookEdit } from './calendar-edit';
import { canImport, canManage, canShare, sourceText, type ViewerCalendar } from './calendars-model';
import { feedFailureOf, feedStatusOf, refreshOptionsOf, type FeedStatus } from './feeds-model';
import { PublishRow } from './publish-row';

function remindersText(calendar: ViewerCalendar): string | null {
  const reminders = calendar.row.default_reminders;
  if (reminders.length === 0) return null;
  return reminders.map((reminder) => beforeText(reminder.minutes_before)).join(', ');
}

function reminderValue(calendar: ViewerCalendar): string {
  const first = calendar.row.default_reminders[0];
  return first === undefined ? NONE : String(first.minutes_before);
}

function useFeedStatus(calendar: ViewerCalendar): FeedStatus | null {
  const feed = calendar.row.feed;
  const regions = useHolidayRegions(feed?.kind === 'holidays').data ?? [];
  const now = useMinuteOf((minute) => minute);
  return feed === null ? null : feedStatusOf(feed, now, regions);
}

function ShownMark({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const edit = useCalendarLookEdit();
  const { row } = calendar;
  return (
    <Interactive
      role="checkbox"
      checked={row.visible}
      disabled={!mayChangeLook(calendar)}
      label={`Show ${row.name}`}
      onPress={() => {
        edit(row.id, { visible: !row.visible });
      }}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-5 items-center justify-center rounded-xs border-2',
          row.visible
            ? cn('border-transparent', LIST_DOT[row.colour])
            : 'border-on-surface-variant',
        )}
      >
        {row.visible ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
    </Interactive>
  );
}

function LookFields({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const lookEdit = useCalendarLookEdit();
  const edit = useCalendarEdit();
  const { row } = calendar;
  return (
    <>
      {mayChangeLook(calendar) ? (
        <ColourSwatches
          label={`${row.name} colour`}
          value={row.colour}
          options={COLOUR_OPTIONS}
          onChange={(colour) => {
            lookEdit(row.id, { colour });
          }}
        />
      ) : null}
      {canManage(calendar) && row.feed === null ? (
        <SelectRow
          title="Default reminder"
          icon="bell"
          compact
          options={reminderOptions(reminderValue(calendar))}
          value={reminderValue(calendar)}
          onChange={(value) => {
            edit(calendar, {
              default_reminders: value === NONE ? [] : [{ minutes_before: Number(value) }],
            });
          }}
        />
      ) : null}
    </>
  );
}

function RefreshField({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const feeds = usePlannerFeeds(usePlannerFrame().person);
  const feed = calendar.row.feed;
  if (feed?.kind !== 'ics' || !canManage(calendar)) return null;
  return (
    <SelectRow
      title="Check for changes"
      icon="refresh"
      compact
      options={refreshOptionsOf(feed.refresh_minutes)}
      value={String(feed.refresh_minutes)}
      onChange={(value) => {
        feeds
          .change(calendar.row.id, { refresh_minutes: Number(value) })
          .catch((error: unknown) => {
            notify({ message: `${calendar.row.name} was not changed`, error, tone: 'critical' });
          });
      }}
    />
  );
}

export type OnImported = (calendar: ViewerCalendar, result: PlannerImportResult) => void;

interface ActionProps {
  readonly calendar: ViewerCalendar;
  readonly onShare: (calendarId: string) => void;
  readonly onImported: OnImported;
}

function ImportButton({
  calendar,
  onImported,
}: Pick<ActionProps, 'calendar' | 'onImported'>): ReactNode {
  const actions = useCalendarActions();
  const [importing, setImporting] = useState(false);
  const runImport = (): void => {
    setImporting(true);
    actions
      .importInto(calendar)
      .then((result) => {
        if (result !== null) onImported(calendar, result);
      })
      .catch((error: unknown) => {
        notify({
          message: `Nothing was imported into ${calendar.row.name}`,
          error,
          tone: 'critical',
        });
      })
      .finally(() => {
        setImporting(false);
      });
  };
  return (
    <Button
      label="Import .ics"
      icon="upload"
      variant="outlined"
      loading={importing}
      onPress={runImport}
    />
  );
}

function MainActions({
  calendar,
  onShare,
  onImported,
  failed,
}: ActionProps & { readonly failed: boolean }): ReactNode {
  const actions = useCalendarActions();
  const ics = calendar.row.feed?.kind === 'ics';
  return (
    <View className="flex-row flex-wrap gap-2">
      {canShare(calendar) ? (
        <Button
          label="Share"
          icon="users"
          variant="tonal"
          onPress={() => {
            onShare(calendar.row.id);
          }}
        />
      ) : null}
      {ics && canManage(calendar) && !failed ? (
        <Button
          label="Refresh now"
          icon="refresh"
          variant="outlined"
          onPress={() => {
            actions.refresh(calendar);
          }}
        />
      ) : null}
      {canImport(calendar) ? <ImportButton calendar={calendar} onImported={onImported} /> : null}
      <Button
        label="Export .ics"
        icon="download"
        variant="outlined"
        onPress={() => {
          actions.exportFile(calendar);
        }}
      />
    </View>
  );
}

function EndAction({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const actions = useCalendarActions();
  if (calendar.share !== null) {
    return (
      <Button
        label="Leave this calendar"
        icon="signOut"
        variant="text"
        onPress={() => {
          actions.leave(calendar);
        }}
      />
    );
  }
  if (!canManage(calendar) || calendar.row.audience === 'household') return null;
  return (
    <Button
      label={calendar.row.feed?.kind === 'ics' ? 'Unsubscribe' : 'Delete calendar'}
      icon="trash"
      variant="destructive"
      onPress={() => {
        actions.remove(calendar);
      }}
    />
  );
}

function FailureNotice({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const actions = useCalendarActions();
  const now = useMinuteOf((minute) => minute);
  const feed = calendar.row.feed;
  const failure = feed === null ? null : feedFailureOf(feed, now);
  if (failure === null) return null;
  return (
    <Banner
      tone="critical"
      title={failure.title}
      body={failure.reason}
      wrapBody
      {...(canManage(calendar)
        ? {
            action: {
              label: 'Refresh now',
              icon: 'refresh',
              variant: 'tonal',
              onPress: (): void => {
                actions.refresh(calendar);
              },
            },
          }
        : {})}
    />
  );
}

function CalendarDetail(props: ActionProps & { readonly onShown: () => void }): ReactNode {
  const { calendar, onShown, ...actions } = props;
  const publishes = canManage(calendar) && calendar.row.feed?.kind !== 'ics';
  const failed = calendar.row.feed?.kind === 'ics' && calendar.row.feed.failure !== null;
  return (
    <View
      onLayout={onShown}
      className="mb-2 gap-3 rounded-md border-hairline border-outline-variant px-3 py-3"
    >
      <FailureNotice calendar={calendar} />
      <LookFields calendar={calendar} />
      <RefreshField calendar={calendar} />
      <MainActions calendar={calendar} {...actions} failed={failed} />
      {publishes ? (
        <View className="gap-2 border-t-hairline border-outline-variant pt-3">
          <PublishRow calendar={calendar} />
        </View>
      ) : null}
      <View className="flex-row justify-end">
        <EndAction calendar={calendar} />
      </View>
    </View>
  );
}

export interface CalendarRowProps extends ActionProps {
  readonly open: boolean;
  readonly onOpen: () => void;
}

export function CalendarRow({ open, onOpen, ...props }: CalendarRowProps): ReactNode {
  const { calendar } = props;
  const status = useFeedStatus(calendar);
  const reveal = useSheetReveal();
  const box = useRef<View>(null);
  const subtitle = status?.text ?? sourceText(calendar);
  const reminders =
    canManage(calendar) && calendar.row.feed === null ? remindersText(calendar) : null;
  return (
    <View ref={box} collapsable={false}>
      <View className="-mx-4">
        <ListRow
          leading={<ShownMark calendar={calendar} />}
          title={calendar.row.name}
          subtitle={subtitle}
          subtitleTone={status?.tone ?? 'variant'}
          {...(reminders === null ? {} : { value: reminders })}
          chevron
          expanded={open}
          label={`${calendar.row.name}, ${subtitle}`}
          onPress={onOpen}
        />
      </View>
      {open ? (
        <CalendarDetail
          {...props}
          onShown={() => {
            reveal(box.current);
          }}
        />
      ) : null}
    </View>
  );
}
