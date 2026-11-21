import type {
  DriveComment,
  DriveCommentAdd,
  DriveCommentEdit,
  DriveCommentThread,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';

export interface CommentsEnv {
  readonly store: Pick<Store, 'host'>;
}

export interface CommentPage {
  readonly items: readonly DriveCommentThread[];
  readonly next: string | null;
}

export class DriveComments {
  constructor(private readonly env: CommentsEnv) {}

  list(actor: DriveActor, itemId: string, cursor: string | undefined): Promise<CommentPage> {
    return this.env.store.host.read('driveComments', { actor, itemId, cursor });
  }

  add(actor: DriveActor, itemId: string, add: DriveCommentAdd): Promise<DriveComment> {
    return this.env.store.host.write('driveCommentAdd', { actor, itemId, add });
  }

  edit(actor: DriveActor, commentId: string, edit: DriveCommentEdit): Promise<DriveComment> {
    return this.env.store.host.write('driveCommentEdit', { actor, commentId, edit });
  }

  resolve(actor: DriveActor, commentId: string, resolved: boolean): Promise<DriveComment> {
    return this.env.store.host.write('driveCommentResolve', { actor, commentId, resolved });
  }

  async remove(actor: DriveActor, commentId: string): Promise<void> {
    await this.env.store.host.write('driveCommentRemove', { actor, commentId });
  }
}
