import { z } from "zod";

import {
  taskUrgencySchema,
  type TaskUrgency,
} from "@/lib/capture/schema";

const callbackSchema = z.object({
  taskId: z.uuid(),
  urgency: taskUrgencySchema,
});

export function taskUrgencyCallback(
  taskId: string,
  urgency: TaskUrgency,
): string {
  return `u:${taskId}:${urgency}`;
}

export function parseTaskUrgencyCallback(
  value: string | undefined,
): z.infer<typeof callbackSchema> | null {
  if (!value || value.length > 64 || !value.startsWith("u:")) {
    return null;
  }

  const separator = value.lastIndexOf(":");

  if (separator <= 2) {
    return null;
  }

  const parsed = callbackSchema.safeParse({
    taskId: value.slice(2, separator),
    urgency: value.slice(separator + 1),
  });

  return parsed.success ? parsed.data : null;
}

export const URGENCY_LABELS: Record<TaskUrgency, string> = {
  today: "Сегодня",
  tomorrow: "Завтра",
  this_week: "Эта неделя",
  next_week: "Следующая неделя",
  this_month: "Этот месяц",
  someday: "Когда-нибудь",
};

export function taskUrgencyKeyboard(taskId: string) {
  const button = (urgency: TaskUrgency) => ({
    text: URGENCY_LABELS[urgency],
    callback_data: taskUrgencyCallback(taskId, urgency),
  });

  return {
    inline_keyboard: [
      [button("today"), button("tomorrow")],
      [button("this_week"), button("next_week")],
      [button("this_month"), button("someday")],
    ],
  };
}

export const TELEGRAM_HELP_TOPICS = [
  "task",
  "journal",
  "meal",
  "event",
  "voice",
] as const;

export type TelegramHelpTopic = (typeof TELEGRAM_HELP_TOPICS)[number];

export function parseHelpCallback(value: string | undefined): TelegramHelpTopic | null {
  if (!value?.startsWith("h:")) return null;
  const topic = value.slice(2);
  return TELEGRAM_HELP_TOPICS.includes(topic as TelegramHelpTopic)
    ? (topic as TelegramHelpTopic)
    : null;
}

export function telegramMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "➕ Задача", callback_data: "h:task" },
        { text: "📓 Дневник", callback_data: "h:journal" },
      ],
      [
        { text: "🍽 Питание", callback_data: "h:meal" },
        { text: "📅 Событие", callback_data: "h:event" },
      ],
      [{ text: "🎙 Голос и фото", callback_data: "h:voice" }],
      [
        { text: "HOME", url: "https://hinkok-os-phi.vercel.app/" },
        { text: "CRM", url: "https://hinkok-os-phi.vercel.app/crm" },
        { text: "BRAIN", url: "https://hinkok-os-phi.vercel.app/brain" },
      ],
    ],
  };
}
