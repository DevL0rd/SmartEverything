import { z } from 'zod';

export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
  scope: z.string(),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const TokenErrorSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});
export type TokenError = z.infer<typeof TokenErrorSchema>;

export const UserInfoSchema = z.object({
  sub: z.string().min(1).optional(),
  email: z.string().min(1),
  email_verified: z.boolean().optional(),
});
export type UserInfo = z.infer<typeof UserInfoSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    status: z.string().optional(),
    errors: z
      .array(
        z.object({
          domain: z.string().optional(),
          reason: z.string().optional(),
          message: z.string().optional(),
        }),
      )
      .optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
