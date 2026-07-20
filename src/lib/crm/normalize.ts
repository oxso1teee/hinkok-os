import type { CrmCategory, CrmSphere, CrmUrgency } from "@/lib/crm/config";

export type CrmTask = {
  id: string;
  title: string;
  description: string | null;
  urgency: CrmUrgency;
  category: CrmCategory;
  sphere: CrmSphere | null;
  key: boolean;
  priorityScore: number;
  timeEstimateMin: number | null;
  tags: string[];
  dueDate: string | null;
  entityId: string | null;
  entityName: string | null;
  completedAt: string | null;
  boardPosition: number;
  createdAt: string;
  updatedAt: string;
};

export type CrmFilters = {
  query: string;
  category: CrmCategory | "all";
  priorityOnly: boolean;
};

export function normalizeCrmSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function taskMatchesCrmFilters(
  task: CrmTask,
  filters: CrmFilters,
): boolean {
  if (filters.category !== "all" && task.category !== filters.category) {
    return false;
  }

  if (filters.priorityOnly && !task.key && task.priorityScore < 70) {
    return false;
  }

  const query = normalizeCrmSearchText(filters.query);
  if (!query) return true;

  const haystack = normalizeCrmSearchText(
    [
      task.title,
      task.description ?? "",
      task.category,
      task.sphere ?? "",
      task.entityName ?? "",
      ...task.tags,
    ].join(" "),
  );

  return query.split(" ").every((token) => haystack.includes(token));
}

export function moveTaskOptimistically(
  tasks: CrmTask[],
  taskId: string,
  urgency: CrmUrgency,
  beforeTaskId: string | null,
): CrmTask[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) return tasks;

  const withoutMoving = tasks.filter((task) => task.id !== taskId);
  const targetIndex = beforeTaskId
    ? withoutMoving.findIndex((task) => task.id === beforeTaskId)
    : -1;
  const moved = { ...moving, urgency };

  if (targetIndex >= 0) {
    return [
      ...withoutMoving.slice(0, targetIndex),
      moved,
      ...withoutMoving.slice(targetIndex),
    ];
  }

  const lastTargetIndex = withoutMoving.reduce(
    (last, task, index) => (task.urgency === urgency ? index : last),
    -1,
  );

  return [
    ...withoutMoving.slice(0, lastTargetIndex + 1),
    moved,
    ...withoutMoving.slice(lastTargetIndex + 1),
  ];
}

export function cleanCrmTags(value: string): string[] {
  return [...new Set(
    value
      .split(/[,\s]+/u)
      .map((tag) =>
        tag
          .toLocaleLowerCase("ru-RU")
          .replace(/[^\p{L}\p{N}_-]/gu, "")
          .slice(0, 32),
      )
      .filter(Boolean),
  )].slice(0, 8);
}
