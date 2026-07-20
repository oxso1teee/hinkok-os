export const BRAIN_SPHERES = [
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

export type BrainSphere = (typeof BRAIN_SPHERES)[number];

export const BRAIN_SPHERE_INFO: Record<BrainSphere, {
  label: string;
  description: string;
}> = {
  work: { label: "Work", description: "Бизнес, клиенты и операционные решения" },
  finance: { label: "Finance", description: "Деньги, бюджет и инвестиции" },
  health: { label: "Health", description: "Тело, питание, сон и тренировки" },
  relationships: { label: "Relationships", description: "Семья, друзья и партнёрство" },
  growth: { label: "Growth", description: "Навыки, обучение и карьера" },
  mind: { label: "Mind", description: "Фокус, эмоции и рефлексия" },
  personal: { label: "Personal", description: "Быт, хобби и личные проекты" },
  content: { label: "Content", description: "Идеи, сценарии и публикации" },
  spirituality: { label: "Spirituality", description: "Ценности, смысл и направление" },
};

export function isBrainSphere(value: string): value is BrainSphere {
  return (BRAIN_SPHERES as readonly string[]).includes(value);
}
