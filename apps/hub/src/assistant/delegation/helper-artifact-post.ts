import { createHash } from 'node:crypto';
import type { AssistantHelperPost, AssistantMessageRow } from '@smarteverything/domain';
import type { Caller } from '../../server/auth';
import type { StoredAttachment } from '../../store/repositories/assistant-files';
import type { Store } from '../../store/store';
import type { AssistantFiles } from '../files';
import { helperArtifactScope } from './helper-artifact-scope';
import { receiptKey } from './helper-receipt';

interface Ports {
  readonly store: Store;
  readonly files: AssistantFiles;
}

export async function postHelperArtifacts(
  ports: Ports,
  caller: Caller,
  input: AssistantHelperPost,
): Promise<AssistantMessageRow> {
  const { store, files } = ports;
  const scope = await helperArtifactScope(store, caller);
  const { parent, helper } = scope.pair;
  const key = receiptKey(parent, `artifact-post:${helper.id}:${input.requestId}`);
  const hash = createHash('sha256')
    .update(JSON.stringify([input.source, input.text]))
    .digest('hex');
  const prepared = await store.host.read('helperArtifactPrepare', {
    helper,
    source: input.source,
    key,
    hash,
  });
  if (prepared.prior !== null) return prepared.prior;
  const copies: StoredAttachment[] = [];
  try {
    for (const file of prepared.files) copies.push(await files.prepareCopy(file));
    const validated = await scope.validate();
    return await store.host.write('helperArtifactCommit', {
      check: scope.check,
      validated: { parentId: validated.pair.parent.id, writer: validated.writer },
      post: input,
      key,
      hash,
      copies,
    });
  } finally {
    await files.discardCopies(copies);
  }
}
