import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { ErrorState } from '../../../components/error-state';
import { Screen } from '../../../components/screen';
import { Skeleton } from '../../../components/skeleton';
import { NotFound } from './not-found';
import { ProgramLibraryProvider } from '../editor/program-library';
import { SequenceEditor } from '../editor/sequence-editor';

interface ExistingSequenceProps {
  readonly id: string;
  readonly reload: string | undefined;
}
function ExistingSequence({ id, reload }: ExistingSequenceProps): ReactNode {
  const query = useQuery({
    queryKey: ['sequence-editor', id, reload],
    queryFn: () => api().call(E.readAutomationSequence, { params: { sequenceId: id } }),
    staleTime: 0,
    retry: false,
  });
  if (query.isPending)
    return (
      <Screen>
        <Skeleton shape="block" className="h-40" />
      </Screen>
    );
  if (query.error !== null)
    return (
      <Screen>
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </Screen>
    );
  return <SequenceEditor key={`${id}:${reload ?? ''}`} start={query.data} />;
}
export function SequenceEditorScreen(): ReactNode {
  const params = z
    .object({ sequenceId: z.string(), reload: z.string().optional() })
    .safeParse(useLocalSearchParams());
  const [newAtOpen] = useState(params.success && params.data.sequenceId === 'new');
  if (!params.success)
    return <NotFound title="Sequence not found" body="This link doesn’t point to a sequence." />;
  return (
    <ProgramLibraryProvider>
      {newAtOpen ? (
        <SequenceEditor start={null} />
      ) : (
        <ExistingSequence id={params.data.sequenceId} reload={params.data.reload} />
      )}
    </ProgramLibraryProvider>
  );
}
