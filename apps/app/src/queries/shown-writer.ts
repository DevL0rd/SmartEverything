import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { background } from '@smarteverything/logging';
import { notify } from '../components/toast-store';
import { writeShownQueries, type ShownQueriesWrite } from './shown-query';

export interface ShownWrite<T> extends ShownQueriesWrite<T> {
  readonly failure: string;
  readonly saved?: (answer: T) => void;
}

export type ShownWriter = <T>(write: ShownWrite<T>) => void;

export function shownWriterOf(
  client: QueryClient,
  settled: (client: QueryClient) => void,
  count: (step: number) => void,
): ShownWriter {
  return (write) => {
    count(1);
    const done = writeShownQueries(client, write).then(
      (answer) => {
        write.saved?.(answer);
        settled(client);
      },
      (error: unknown) => {
        settled(client);
        notify({ message: write.failure, error, tone: 'critical' });
      },
    );
    background(
      done.finally(() => {
        count(-1);
      }),
      'queries.shown_write_settle_failed',
      { event: write.event },
    );
  };
}

export interface ShownWriting {
  readonly busy: boolean;
  readonly write: ShownWriter;
  readonly client: QueryClient;
}

export function useShownWriter(settled: (client: QueryClient) => void): ShownWriting {
  const client = useQueryClient();
  const [pending, setPending] = useState(0);
  const write = shownWriterOf(client, settled, (step) => {
    setPending((current) => current + step);
  });
  return { busy: pending > 0, write, client };
}
