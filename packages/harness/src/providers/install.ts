import type { Context } from '@deepseek-ai/cordis';
import { SubscriptionRouteAdapter } from './adapter';
import type { SubscriptionRouteOptions } from './adapter';

export function installSubscriptionRoutes(
  ctx: Context,
  options: SubscriptionRouteOptions,
): SubscriptionRouteAdapter {
  const adapter = new SubscriptionRouteAdapter(options);
  const registration = ctx.llm.registerAdapter(
    options.routes.map((route) => route.id),
    adapter,
  );
  ctx.effect(() => registration);
  return adapter;
}
