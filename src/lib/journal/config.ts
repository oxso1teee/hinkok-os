export const JOURNAL_MOODS = [
  { value: "1", label: "awful", emoji: "☹" },
  { value: "2", label: "bad", emoji: "◔" },
  { value: "3", label: "meh", emoji: "●" },
  { value: "4", label: "good", emoji: "◕" },
  { value: "5", label: "rad", emoji: "☺" },
] as const;

export type JournalMood = (typeof JOURNAL_MOODS)[number]["value"];

export const JOURNAL_PROMPTS = [
  "Что сегодня получилось хорошо и почему?",
  "На что сегодня ушла энергия — и было ли это важно?",
  "Какое одно решение сильнее всего улучшит следующий день?",
  "Что я сейчас откладываю и какой самый маленький следующий шаг?",
  "За что я благодарен этому дню?",
  "Где сегодня я действовал в согласии со своими ценностями?",
  "Что сегодня удивило или изменило моё мнение?",
  "Что стоит перестать делать, чтобы освободить внимание?",
  "Какой разговор или контакт сегодня оказался важным?",
] as const;

export function isJournalMood(value: string): value is JournalMood {
  return JOURNAL_MOODS.some((mood) => mood.value === value);
}
