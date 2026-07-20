export const CRM_URGENCIES = [
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "this_month",
  "someday",
] as const;

export type CrmUrgency = (typeof CRM_URGENCIES)[number];

export const CRM_COLUMNS: ReadonlyArray<{
  id: CrmUrgency;
  label: string;
  shortLabel: string;
}> = [
  { id: "today", label: "Сегодня", shortLabel: "today" },
  { id: "tomorrow", label: "Завтра", shortLabel: "tomorrow" },
  { id: "this_week", label: "На этой неделе", shortLabel: "this week" },
  { id: "next_week", label: "На следующей", shortLabel: "next week" },
  { id: "this_month", label: "В этом месяце", shortLabel: "this month" },
  { id: "someday", label: "Когда-нибудь", shortLabel: "someday" },
];

export const CRM_CATEGORIES = [
  "work",
  "content",
  "health",
  "finance",
  "personal",
] as const;

export type CrmCategory = (typeof CRM_CATEGORIES)[number];

export const CRM_CATEGORY_LABELS: Record<CrmCategory, string> = {
  work: "Работа",
  content: "Контент",
  health: "Здоровье",
  finance: "Финансы",
  personal: "Личное",
};

export const CRM_SPHERES = [
  "work",
  "finance",
  "health",
  "relationships",
  "growth",
  "mind",
  "personal",
  "content",
  "spirituality",
] as const;

export type CrmSphere = (typeof CRM_SPHERES)[number];

export const CRM_SPHERE_LABELS: Record<CrmSphere, string> = {
  work: "Работа",
  finance: "Финансы",
  health: "Здоровье",
  relationships: "Отношения",
  growth: "Развитие",
  mind: "Сознание",
  personal: "Личное",
  content: "Контент",
  spirituality: "Смыслы",
};

export function isCrmUrgency(value: string): value is CrmUrgency {
  return (CRM_URGENCIES as readonly string[]).includes(value);
}

export function isCrmCategory(value: string): value is CrmCategory {
  return (CRM_CATEGORIES as readonly string[]).includes(value);
}

export function isCrmSphere(value: string): value is CrmSphere {
  return (CRM_SPHERES as readonly string[]).includes(value);
}
