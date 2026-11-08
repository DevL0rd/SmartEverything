export class ClockTextNotRead extends Error {
  constructor() {
    super('Alarms and timers can’t be added from text yet.');
  }
}

export function addClockText(text: string): Promise<boolean> {
  if (text.trim() === '') return Promise.resolve(false);
  return Promise.reject(new ClockTextNotRead());
}
