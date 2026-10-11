import { z } from 'zod';

export const permissionOverrideItemSchema = z.object({
  key: z.string().min(3).max(120),
  effect: z.enum(['allow', 'deny'])
});

export const updateUserPermissionsSchema = z.object({
  overrides: z.array(permissionOverrideItemSchema).max(200).default([])
});
