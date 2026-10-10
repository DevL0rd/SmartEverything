import { z } from 'zod';

const BUILD_ENV = z.object({
  devServerUrl: z.url({ protocol: /^https?$/ }).optional(),
});

export function readBuildEnv(): ReturnType<typeof BUILD_ENV.safeParse> {
  return BUILD_ENV.safeParse({ devServerUrl: process.env.EXPO_PUBLIC_DEV_SERVER_URL });
}
