import type { Context } from '@deepseek-ai/cordis';
import WebRuntime from '@deepseek-ai/dsh-web';
import * as FetchHttp from '@deepseek-ai/dsh-web-fetch-http';
import * as WebTools from '@deepseek-ai/dsh-tool-web';

const USER_AGENT = 'SmartEverything/0.1 (public-document-reader)';

export async function mountWebTools(ctx: Context): Promise<void> {
  await ctx.plugin(WebRuntime);
  await ctx.plugin(FetchHttp, { userAgent: USER_AGENT });
  await ctx.plugin(WebTools, { search: false });
}
