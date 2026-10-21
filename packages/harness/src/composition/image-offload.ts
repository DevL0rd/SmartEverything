import type { Context } from '@deepseek-ai/cordis';
import * as ImageOffload from '@deepseek-ai/dsh-compaction-image-offload';
import { IMAGE_OFFLOAD_REQUIRED_CODE } from '@deepseek-ai/dsh-llm';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.harness');

export async function mountImageOffload(ctx: Context): Promise<void> {
  await ctx.plugin(ImageOffload);
  ctx.on(
    'agent/request-error',
    ({ agent, failure }, next) => {
      if (failure.code === IMAGE_OFFLOAD_REQUIRED_CODE)
        log.info('session.images_offloaded', {
          session_id: agent.session.id,
          images: failure.offloadImages,
        });
      return next();
    },
    { prepend: true },
  );
}
