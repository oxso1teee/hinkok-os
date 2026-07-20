import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
});

const telegramChatSchema = z.object({
  id: z
    .number()
    .int()
    .min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER),
  type: z.enum(["private", "group", "supergroup", "channel"]),
});

const telegramVoiceSchema = z.object({
  file_id: z.string().min(1).max(512),
  file_unique_id: z.string().min(1).max(512),
  duration: z.number().int().nonnegative(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
});

const telegramPhotoSizeSchema = z.object({
  file_id: z.string().min(1).max(512),
  file_unique_id: z.string().min(1).max(512),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  file_size: z.number().int().nonnegative().optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number().int().nonnegative(),
  date: z.number().int().nonnegative(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().max(50_000).optional(),
  caption: z.string().max(4096).optional(),
  voice: telegramVoiceSchema.optional(),
  photo: z.array(telegramPhotoSizeSchema).max(20).optional(),
});

const telegramCallbackQuerySchema = z.object({
  id: z.string().min(1).max(512),
  from: telegramUserSchema,
  data: z.string().max(64).optional(),
  message: telegramMessageSchema.optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramCallbackQuery = z.infer<
  typeof telegramCallbackQuerySchema
>;
