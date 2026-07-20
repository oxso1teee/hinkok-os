import type { CrmUrgency } from "@/lib/crm/config";
import type { CrmTask } from "@/lib/crm/normalize";

/** Pure optimistic reorder used by pointer, touch, keyboard and select moves. */
export function applyOptimisticTaskMove(
  tasks: readonly CrmTask[],
  taskId: string,
  urgency: CrmUrgency,
  beforeTaskId: string | null,
): CrmTask[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving || taskId === beforeTaskId) return [...tasks];

  const remaining = tasks.filter((task) => task.id !== taskId);
  const moved: CrmTask = { ...moving, urgency };
  const anchorIndex = beforeTaskId
    ? remaining.findIndex((task) => task.id === beforeTaskId && task.urgency === urgency)
    : -1;

  if (anchorIndex >= 0) {
    return [
      ...remaining.slice(0, anchorIndex),
      moved,
      ...remaining.slice(anchorIndex),
    ];
  }

  const lastTargetIndex = remaining.reduce(
    (last, task, index) => (task.urgency === urgency ? index : last),
    -1,
  );
  return [
    ...remaining.slice(0, lastTargetIndex + 1),
    moved,
    ...remaining.slice(lastTargetIndex + 1),
  ];
}
