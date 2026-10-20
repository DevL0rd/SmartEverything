import type { BottleSession } from '@smarteverything/domain';
import { millilitres } from '../../../format/number';
import { clock, duration, moment } from '../../../format/time';

interface SessionCard {
  readonly title: string;
  readonly when: string;
  readonly drunk: string;
  readonly drinks: string;
  readonly span: string;
  readonly open: boolean;
  readonly summary: string;
}

export function sessionCardOf(session: BottleSession, now: number): SessionCard {
  const seconds = Math.max(0, (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000);
  const drunk = millilitres(Math.round(session.drunkMl));
  const drinks = `${String(session.drinks)} ${session.drinks === 1 ? 'drink' : 'drinks'}`;
  const span = session.open ? 'Still filled' : duration(Math.round(seconds));
  const when = moment(session.startedAt, now);
  return {
    title: session.open
      ? 'Current fill'
      : `${clock(session.startedAt)} to ${clock(session.endedAt)}`,
    when,
    drunk,
    drinks,
    span,
    open: session.open,
    summary: `${session.open ? 'Current fill' : 'Fill'} from ${when}: ${drunk} in ${drinks}.`,
  };
}

interface CurvePoint {
  readonly t: number;
  readonly v: number;
}

export function curveOf(session: BottleSession): readonly CurvePoint[] {
  return session.curve.map((point) => ({ t: Date.parse(point.at), v: point.ml }));
}
