import type { PlannerImportResult } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { useAnchoredMenu } from '../../../components/menu';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { usePlannerFeeds } from '../data/feeds';
import { useViewerCalendars } from '../data/sharing';
import { usePlannerFrame } from '../frame/frame-context';
import type { Prefs } from '../settings/preferences';
import { AddCalendarSheet, type AddKind } from './add-sheets';
import { CalendarRow } from './calendar-row';
import {
  sectionsOf,
  type CalendarSection,
  type CalendarSectionKey,
  type ViewerCalendar,
} from './calendars-model';
import { ImportReportSheet } from './import-report-sheet';
import { ShareSheet } from './share-sheet';
import { SHOW_KEYS, ShowChips } from './show-chips';

interface Report {
  readonly calendar: string;
  readonly result: PlannerImportResult;
}

interface SheetActions {
  readonly add: (kind: AddKind) => void;
  readonly addBirthdays: () => void;
  readonly share: (calendarId: string) => void;
  readonly imported: (calendar: ViewerCalendar, result: PlannerImportResult) => void;
}

const EMPTY_ROW: Readonly<
  Partial<Record<CalendarSectionKey, { readonly title: string; readonly kind: AddKind | null }>>
> = {
  mine: { title: 'New calendar', kind: 'calendar' },
  subscriptions: { title: 'Subscribe by address', kind: 'subscribe' },
  holidays: { title: 'Add public holidays', kind: 'holidays' },
  birthdays: { title: 'Add the birthdays calendar', kind: null },
};

function SectionHead({ section }: { readonly section: CalendarSection }): ReactNode {
  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-3">
      <Icon name={section.icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" accessibilityRole="header" className="flex-1">
        {section.title}
      </Text>
      {section.calendars.length > 0 ? (
        <Text variant="caption" tone="faint" className="tabular">
          {String(section.calendars.length)}
        </Text>
      ) : null}
    </View>
  );
}

function EmptySection({
  section,
  actions,
}: {
  readonly section: CalendarSection;
  readonly actions: SheetActions;
}): ReactNode {
  const row = EMPTY_ROW[section.key];
  if (row === undefined) return null;
  return (
    <ListRow
      icon="plus"
      title={row.title}
      onPress={() => {
        if (row.kind === null) actions.addBirthdays();
        else actions.add(row.kind);
      }}
    />
  );
}

function SectionBlock({
  section,
  actions,
}: {
  readonly section: CalendarSection;
  readonly actions: SheetActions;
}): ReactNode {
  const [opened, setOpened] = useState<string | null>(null);
  if (section.calendars.length === 0 && EMPTY_ROW[section.key] === undefined) return null;
  return (
    <View>
      <SectionHead section={section} />
      {section.calendars.length === 0 ? <EmptySection section={section} actions={actions} /> : null}
      {section.calendars.map((calendar) => (
        <CalendarRow
          key={calendar.row.id}
          calendar={calendar}
          open={opened === calendar.row.id}
          onOpen={() => {
            setOpened(opened === calendar.row.id ? null : calendar.row.id);
          }}
          onShare={actions.share}
          onImported={actions.imported}
        />
      ))}
    </View>
  );
}

function AddMenu({
  actions,
  hasBirthdays,
}: {
  readonly actions: SheetActions;
  readonly hasBirthdays: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(
    [
      {
        label: 'New calendar',
        icon: 'calendar',
        onPress: (): void => {
          actions.add('calendar');
        },
      },
      {
        label: 'Subscribe by address',
        icon: 'globe',
        onPress: (): void => {
          actions.add('subscribe');
        },
      },
      {
        label: 'Public holidays',
        icon: 'sun',
        onPress: (): void => {
          actions.add('holidays');
        },
      },
      {
        label: 'Birthdays',
        icon: 'party',
        disabled: hasBirthdays,
        description: hasBirthdays
          ? 'Already in your calendars'
          : 'Everyone at home with a birth date',
        onPress: actions.addBirthdays,
      },
    ],
    'Add a calendar',
  );
  return (
    <View ref={ref} collapsable={false} className="flex-row px-4">
      <Button label="Add calendar" icon="plus" variant="tonal" onPress={open} />
      {menu}
    </View>
  );
}

function useSheetActions(): {
  readonly actions: SheetActions;
  readonly adding: AddKind | null;
  readonly sharing: string | null;
  readonly report: Report | null;
  readonly close: () => void;
} {
  const feeds = usePlannerFeeds(usePlannerFrame().person);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  return {
    actions: {
      add: setAdding,
      share: setSharing,
      imported: (calendar, result): void => {
        setReport({ calendar: calendar.row.name, result });
      },
      addBirthdays: (): void => {
        feeds.add({ kind: 'birthdays' }).catch((error: unknown) => {
          notify({ message: 'The birthdays calendar was not added', error, tone: 'critical' });
        });
      },
    },
    adding,
    sharing,
    report,
    close: (): void => {
      setAdding(null);
      setSharing(null);
      setReport(null);
    },
  };
}

function SheetBody({ prefs }: { readonly prefs: Prefs }): ReactNode {
  const calendars = useViewerCalendars(usePlannerFrame().person);
  const sheets = useSheetActions();
  const sections = sectionsOf(calendars);
  const hasBirthdays = calendars.some((calendar) => calendar.section === 'birthdays');
  return (
    <View className="gap-2 pb-2">
      <AddMenu actions={sheets.actions} hasBirthdays={hasBirthdays} />
      {sections.map((section) => (
        <SectionBlock key={section.key} section={section} actions={sheets.actions} />
      ))}
      <View className="mx-4 mt-1 h-hairline bg-outline-variant" />
      <View className="gap-2 px-4">
        <Text variant="caption" tone="variant">
          Show on the calendar
        </Text>
        <View className="flex-row flex-wrap items-center gap-1">
          <ShowChips prefs={prefs} keys={SHOW_KEYS} />
        </View>
      </View>
      <AddCalendarSheet kind={sheets.adding} onClose={sheets.close} />
      <ShareSheet calendarId={sheets.sharing} onClose={sheets.close} />
      <ImportReportSheet report={sheets.report} onClose={sheets.close} />
    </View>
  );
}

export interface CalendarsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly prefs: Prefs;
}

export function CalendarsSheet({ open, onClose, prefs }: CalendarsSheetProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Calendars" detents={['half', 'full']}>
      {open ? <SheetBody prefs={prefs} /> : null}
    </Sheet>
  );
}
