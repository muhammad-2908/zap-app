import { z } from 'zod';

const stringMap = z.record(z.string(), z.string().max(65_536));

const TriggerInput = z
  .object({
    app: z.string().trim().min(1, 'Pick a trigger app'),
    event: z.string().trim().min(1, 'Pick a trigger event'),
    config: stringMap.default({}),
  })
  .strict();

const ActionInput = z
  .object({
    app: z.string().trim().min(1, 'Pick an action app'),
    type: z.string().trim().min(1, 'Pick an action'),
    fields: stringMap.default({}),
  })
  .strict();

const name = z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters');

/** POST /api/zaps. Unknown keys (e.g. owner) are rejected, so a client can't set them. */
export const CreateZapSchema = z
  .object({
    name,
    enabled: z.boolean().default(false),
    trigger: TriggerInput,
    action: ActionInput,
  })
  .strict();

/** PATCH /api/zaps/:id. Any subset; trigger/action are replaced as a whole when present. */
export const UpdateZapSchema = z
  .object({
    name: name.optional(),
    enabled: z.boolean().optional(),
    trigger: TriggerInput.optional(),
    action: ActionInput.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type CreateZapInput = z.infer<typeof CreateZapSchema>;
export type UpdateZapInput = z.infer<typeof UpdateZapSchema>;
