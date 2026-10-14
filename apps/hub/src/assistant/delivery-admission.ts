import type {
  AssistantEventsRepository,
  StoredEvent,
} from '../store/repositories/assistant-events';
type Admission = (event: StoredEvent) => boolean;
const admissions = new WeakMap<AssistantEventsRepository, Set<Admission>>();
export function registerDeliveryAdmission(
  events: AssistantEventsRepository,
  admit: Admission,
): () => void {
  const current = admissions.get(events) ?? new Set<Admission>();
  current.add(admit);
  admissions.set(events, current);
  return (): void => {
    current.delete(admit);
    if (current.size === 0) admissions.delete(events);
  };
}
export function liveDeliveryAdmitted(
  events: AssistantEventsRepository,
  event: StoredEvent,
): boolean {
  const current = admissions.get(events);
  if (current === undefined || [...current].every((admit) => admit(event))) return true;
  events.mark(event.id, 'answered_at');
  return false;
}
