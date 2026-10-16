import { automationSignals } from './automation';
import type { RowChange, SignalInput } from '@smarteverything/domain';
import { assistantSignals } from './assistant';
import type { FeedContext, FeedProducer } from './feed-context';
import { healthSignals } from './health';
import { scheduleSignals } from './schedule';
import { weatherSignals } from './weather';

const FEED_PRODUCERS: readonly FeedProducer[] = [
  automationSignals,
  weatherSignals,
  healthSignals,
  assistantSignals,
  scheduleSignals,
];

export function feedSignals(change: RowChange, context: FeedContext): readonly SignalInput[] {
  return FEED_PRODUCERS.flatMap((producer) => producer(change, context));
}
