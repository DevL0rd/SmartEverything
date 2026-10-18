import { Logger } from '@smarteverything/logging';
import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type AiProjectFile,
  type AiProjectResult,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { compareText } from '../../../format/text';

const log = new Logger('app.project-files');
export const PROJECT_ROOT = 'workspace';

const LIST_LIMIT = 1000;

export function useProjectList(
  chatId: string,
  path: string,
): UseQueryResult<readonly AiProjectFile[]> {
  return useScreenQuery({
    queryKey: ['window', 'ai-project', chatId, path],
    queryFn: async () => {
      const startedAt = Date.now();
      try {
        const result = await api().call(E.readAiProjectFiles, {
          params: { chatId },
          body: { operation: 'list', path, limit: LIST_LIMIT },
        });
        log.debug('project_files.listed', () => ({
          chatId,
          pathLength: path.length,
          entries: result.entries?.length ?? 0,
          durationMs: Date.now() - startedAt,
        }));
        return result.entries ?? [];
      } catch (error) {
        log.error('project_files.list_failed', error, {
          chatId,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    },
  });
}

export function readProjectText(
  chatId: string,
  path: string,
  offset: number,
): Promise<AiProjectResult> {
  const operation = log.operation('project_file.read', { chatId, offset });
  return api()
    .call(E.readAiProjectFiles, {
      params: { chatId },
      body: { operation: 'read', path, offset, encoding: 'utf8' },
    })
    .then(
      (result) => {
        operation.succeeded();
        return result;
      },
      (error: unknown) => {
        operation.failed(error);
        throw error;
      },
    );
}

export function sortedProjectEntries(entries: readonly AiProjectFile[]): readonly AiProjectFile[] {
  return [...entries].sort(
    (left, right) =>
      Number(right.type === 'directory') - Number(left.type === 'directory') ||
      compareText(left.path, right.path),
  );
}

export function parentPath(path: string): string | null {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? null : path.slice(0, cut);
}

export function leafName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
