import { PLANNER_ALARM_SOUND_READ_UNITS } from '../../planner/units/alarm-sounds';
import { PLANNER_BEDTIME_READ_UNITS } from '../../planner/units/bedtime';
import { PLANNER_CLOCK_WRITE_UNITS } from '../../planner/units/clock';
import {
  PLANNER_COMPLETION_READ_UNITS,
  PLANNER_COMPLETION_WRITE_UNITS,
} from '../../planner/units/completion';
import { PLANNER_FEED_WRITE_UNITS } from '../../planner/units/feeds';
import {
  PLANNER_GOOGLE_CALENDAR_READ_UNITS,
  PLANNER_GOOGLE_CALENDAR_WRITE_UNITS,
} from '../../planner/units/google-calendar';
import {
  PLANNER_BOOKING_READ_UNITS,
  PLANNER_BOOKING_WRITE_UNITS,
} from '../../planner/units/booking';
import { PLANNER_INSTANT_WRITE_UNITS } from '../../planner/units/instants';
import { PLANNER_INVITE_READ_UNITS, PLANNER_INVITE_WRITE_UNITS } from '../../planner/units/invites';
import { PLANNER_ICAL_READ_UNITS, PLANNER_ICAL_WRITE_UNITS } from '../../planner/units/ical';
import { PLANNER_PHONE_READ_UNITS } from '../../planner/units/phone-rings';
import {
  PLANNER_REMINDER_READ_UNITS,
  PLANNER_REMINDER_WRITE_UNITS,
} from '../../planner/units/reminders';
import { PLANNER_RSVP_READ_UNITS, PLANNER_RSVP_WRITE_UNITS } from '../../planner/units/rsvp';
import { PLANNER_SUMMARY_READ_UNITS } from '../../planner/units/summary';
import { PLANNER_VIEW_READ_UNITS, PLANNER_VIEW_WRITE_UNITS } from '../../planner/units/views';
import { PLANNER_VISIBILITY_READ_UNITS } from '../../planner/units/visibility';
import { PLANNER_WATCH_READ_UNITS, PLANNER_WATCH_WRITE_UNITS } from '../../planner/units/watch';

export const PLANNER_READ_UNITS = {
  ...PLANNER_ALARM_SOUND_READ_UNITS,
  ...PLANNER_BEDTIME_READ_UNITS,
  ...PLANNER_COMPLETION_READ_UNITS,
  ...PLANNER_PHONE_READ_UNITS,
  ...PLANNER_REMINDER_READ_UNITS,
  ...PLANNER_SUMMARY_READ_UNITS,
  ...PLANNER_ICAL_READ_UNITS,
  ...PLANNER_WATCH_READ_UNITS,
  ...PLANNER_GOOGLE_CALENDAR_READ_UNITS,
  ...PLANNER_RSVP_READ_UNITS,
  ...PLANNER_BOOKING_READ_UNITS,
  ...PLANNER_INVITE_READ_UNITS,
  ...PLANNER_VISIBILITY_READ_UNITS,
  ...PLANNER_VIEW_READ_UNITS,
} as const;

export const PLANNER_WRITE_UNITS = {
  ...PLANNER_CLOCK_WRITE_UNITS,
  ...PLANNER_COMPLETION_WRITE_UNITS,
  ...PLANNER_REMINDER_WRITE_UNITS,
  ...PLANNER_FEED_WRITE_UNITS,
  ...PLANNER_ICAL_WRITE_UNITS,
  ...PLANNER_WATCH_WRITE_UNITS,
  ...PLANNER_GOOGLE_CALENDAR_WRITE_UNITS,
  ...PLANNER_RSVP_WRITE_UNITS,
  ...PLANNER_BOOKING_WRITE_UNITS,
  ...PLANNER_INVITE_WRITE_UNITS,
  ...PLANNER_INSTANT_WRITE_UNITS,
  ...PLANNER_VIEW_WRITE_UNITS,
} as const;
