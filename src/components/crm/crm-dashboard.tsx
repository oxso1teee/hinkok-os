"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { TopbarTicker } from "@/components/ui/topbar-ticker";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/ui/icon";
import {
  CRM_CATEGORIES,
  CRM_CATEGORY_LABELS,
  CRM_COLUMNS,
  CRM_SPHERES,
  CRM_SPHERE_LABELS,
  type CrmCategory,
  type CrmSphere,
  type CrmUrgency,
} from "@/lib/crm/config";
import type { CrmDashboardData, CrmEntity } from "@/lib/crm/data";
import {
  cleanCrmTags,
  taskMatchesCrmFilters,
  type CrmTask,
} from "@/lib/crm/normalize";
import { applyOptimisticTaskMove } from "@/lib/crm/optimistic";

type CrmView = "kanban" | "smart" | "archive";

type TaskDraft = {
  title: string;
  description: string;
  urgency: CrmUrgency;
  category: CrmCategory;
  sphere: CrmSphere | "";
  key: boolean;
  priorityScore: number;
  timeEstimateMin: string;
  tags: string;
  entityId: string;
};

const EMPTY_DRAFT: TaskDraft = {
  title: "",
  description: "",
  urgency: "this_week",
  category: "personal",
  sphere: "personal",
  key: false,
  priorityScore: 30,
  timeEstimateMin: "",
  tags: "",
  entityId: "",
};

function clockText(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("ru-RU");
}

function priorityLabel(task: CrmTask): "hot" | "warm" | "cold" {
  if (task.key || task.priorityScore >= 70) return "hot";
  if (task.priorityScore >= 30) return "warm";
  return "cold";
}

function draftFromTask(task: CrmTask): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    urgency: task.urgency,
    category: task.category,
    sphere: task.sphere ?? "",
    key: task.key,
    priorityScore: Math.round(task.priorityScore),
    timeEstimateMin: task.timeEstimateMin?.toString() ?? "",
    tags: task.tags.join(", "),
    entityId: task.entityId ?? "",
  };
}

function apiTask(draft: TaskDraft) {
  const estimate = Number.parseInt(draft.timeEstimateMin, 10);
  return {
    title: draft.title.replace(/\s+/g, " ").trim(),
    description: draft.description.trim() || null,
    urgency: draft.urgency,
    category: draft.category,
    sphere: draft.sphere || null,
    key: draft.key,
    priorityScore: draft.priorityScore,
    timeEstimateMin: Number.isInteger(estimate) && estimate > 0 ? estimate : null,
    tags: cleanCrmTags(draft.tags),
    entityId: draft.entityId || null,
  };
}

export class CrmActionError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: Record<string, unknown> | null,
  ) {
    super(`crm_action_failed:${status}`);
    this.name = "CrmActionError";
  }
}

async function postAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/crm/tasks", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new CrmActionError(response.status, result);
  return result ?? {};
}

function TaskEditor({
  task,
  entities,
  busy,
  onClose,
  onSave,
}: {
  task: CrmTask | null;
  entities: CrmEntity[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() =>
    task ? draftFromTask(task) : EMPTY_DRAFT,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSave(draft);
  }

  return (
    <div className="crm-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="crm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="crm-modal-head">
          <div>
            <span>{task ? "EDIT / TASK" : "NEW / TASK"}</span>
            <h2 id="crm-editor-title">{task ? "Редактировать задачу" : "Новая задача"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={17} />
          </button>
        </header>
        <form className="crm-editor-form" onSubmit={submit}>
          <label className="crm-field crm-field-wide">
            <span>Название</span>
            <input
              autoFocus
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Что нужно сделать?"
            />
          </label>
          <label className="crm-field crm-field-wide">
            <span>Описание</span>
            <textarea
              maxLength={4_000}
              rows={4}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Контекст, результат, следующий шаг"
            />
          </label>
          <label className="crm-field">
            <span>Срок</span>
            <select
              value={draft.urgency}
              onChange={(event) => setDraft({ ...draft, urgency: event.target.value as CrmUrgency })}
            >
              {CRM_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Категория</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value as CrmCategory })}
            >
              {CRM_CATEGORIES.map((category) => <option key={category} value={category}>{CRM_CATEGORY_LABELS[category]}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Сфера</span>
            <select
              value={draft.sphere}
              onChange={(event) => setDraft({ ...draft, sphere: event.target.value as CrmSphere | "" })}
            >
              <option value="">Без сферы</option>
              {CRM_SPHERES.map((sphere) => <option key={sphere} value={sphere}>{CRM_SPHERE_LABELS[sphere]}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Связь</span>
            <select
              value={draft.entityId}
              onChange={(event) => setDraft({ ...draft, entityId: event.target.value })}
            >
              <option value="">Без связи</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name} · {entity.kind}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Приоритет · {draft.priorityScore}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={draft.priorityScore}
              onChange={(event) => setDraft({ ...draft, priorityScore: Number(event.target.value) })}
            />
          </label>
          <label className="crm-field">
            <span>Оценка, минут</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={draft.timeEstimateMin}
              onChange={(event) => setDraft({ ...draft, timeEstimateMin: event.target.value.replace(/\D/gu, "").slice(0, 4) })}
              placeholder="30"
            />
          </label>
          <label className="crm-field crm-field-wide">
            <span>Теги через запятую</span>
            <input
              maxLength={280}
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              placeholder="клиент, видео, запуск"
            />
          </label>
          <label className="crm-key-field crm-field-wide">
            <input
              type="checkbox"
              checked={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.checked })}
            />
            <span>Ключевая задача — показывать в приоритетном фокусе</span>
          </label>
          <footer className="crm-modal-actions crm-field-wide">
            <button className="secondary-button" type="button" onClick={onClose}>Отмена</button>
            <button className="primary-button" type="submit" disabled={busy || !draft.title.trim()}>
              {busy ? "Сохраняю…" : task ? "Сохранить" : "Создать задачу"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function TaskCard({
  task,
  busy,
  draggable,
  onEdit,
  onComplete,
  onRestore,
  onMove,
}: {
  task: CrmTask;
  busy: boolean;
  draggable: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onRestore?: () => void;
  onMove: (urgency: CrmUrgency) => void;
}) {
  const priority = priorityLabel(task);
  const drag = useDraggable({ id: `task:${task.id}`, disabled: !draggable || busy });
  const drop = useDroppable({ id: `task:${task.id}`, disabled: !draggable });
  const setDragNodeRef = drag.setNodeRef;
  const setDropNodeRef = drop.setNodeRef;
  const setNodeRef = useCallback((node: HTMLElement | null) => {
    setDragNodeRef(node);
    setDropNodeRef(node);
  }, [setDragNodeRef, setDropNodeRef]);
  const style = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform) }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`crm-task-card priority-${priority} ${busy ? "is-busy" : ""} ${drag.isDragging ? "is-dragging" : ""} ${drop.isOver ? "is-drag-over" : ""}`}
    >
      <div className="crm-card-main">
        <span className="crm-card-avatar" aria-hidden="true">{initials(task.entityName ?? task.title)}</span>
        <div className="crm-card-copy">
          <strong>{task.title}</strong>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        {draggable ? (
          <button
            className="crm-drag-handle"
            type="button"
            title="Перетащить"
            aria-label={`Перетащить задачу ${task.title}`}
            disabled={busy}
            {...drag.attributes}
            {...drag.listeners}
          >
            <Icon name="grip" size={14} />
          </button>
        ) : null}
      </div>
      <div className="crm-card-meta">
        <span className={`priority-chip ${priority}`}>{priority}</span>
        {task.timeEstimateMin ? <span>{task.timeEstimateMin}m</span> : null}
        {task.entityName ? <span>{task.entityName}</span> : null}
      </div>
      <footer className="crm-card-footer">
        <span>{task.sphere ?? task.category}</span>
        <div className="crm-card-actions">
          {draggable ? (
            <select
              value={task.urgency}
              disabled={busy}
              onChange={(event) => onMove(event.target.value as CrmUrgency)}
              aria-label={`Переместить задачу ${task.title}`}
              title="Переместить"
            >
              {CRM_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
            </select>
          ) : null}
          <button type="button" disabled={busy} onClick={onEdit} aria-label={`Редактировать ${task.title}`}>
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRestore ?? onComplete}
            aria-label={onRestore ? `Вернуть ${task.title}` : `Завершить ${task.title}`}
          >
            {onRestore ? <Icon name="arrow" size={12} /> : <Icon name="check" size={12} />}
          </button>
        </div>
      </footer>
    </article>
  );
}

function DroppableColumn({
  columnId,
  active,
  children,
}: {
  columnId: CrmUrgency;
  active: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${columnId}` });
  return (
    <section ref={setNodeRef} className={`crm-column ${active ? "is-drop-ready" : ""} ${isOver ? "is-drag-over" : ""}`}>
      {children}
    </section>
  );
}

export function CrmDashboard({ data }: { data: CrmDashboardData }) {
  const [tasks, setTasks] = useState(data.tasks);
  const [archived, setArchived] = useState(data.archivedTasks);
  const [view, setView] = useState<CrmView>("kanban");
  const [query, setQuery] = useState("");
  const [smartQuery, setSmartQuery] = useState("");
  const [category, setCategory] = useState<CrmCategory | "all">("all");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [editorTask, setEditorTask] = useState<CrmTask | null | undefined>(undefined);
  const [editorBusy, setEditorBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(() => new Date(data.generatedAt));
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A delay-based constraint (not distance-based) so a normal vertical swipe
    // to scroll the task list is not immediately hijacked as a drag on touch
    // devices; the touch has to be held briefly before a drag commits.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => taskMatchesCrmFilters(task, {
      query: view === "smart" ? smartQuery : query,
      category,
      priorityOnly,
    })),
    [tasks, query, smartQuery, category, priorityOnly, view],
  );
  const visibleArchive = useMemo(
    () => archived.filter((task) => taskMatchesCrmFilters(task, {
      query,
      category,
      priorityOnly,
    })),
    [archived, query, category, priorityOnly],
  );

  function markBusy(taskId: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(taskId); else next.delete(taskId);
      return next;
    });
  }

  async function moveTask(taskId: string, urgency: CrmUrgency, beforeTaskId: string | null) {
    if (taskId === beforeTaskId || busyIds.has(taskId)) return;
    const snapshot = tasks;
    setTasks((current) => applyOptimisticTaskMove(current, taskId, urgency, beforeTaskId));
    markBusy(taskId, true);
    try {
      await postAction({ action: "move", taskId, urgency, beforeTaskId });
      setMessage("Позиция сохранена");
      window.setTimeout(() => setMessage(""), 1_500);
    } catch (error) {
      if (error instanceof CrmActionError && error.status >= 500) {
        setTasks(snapshot);
        setMessage("Сервер не сохранил перемещение — изменение отменено");
      } else {
        setMessage("Изменение оставлено локально; синхронизация будет повторена позже");
      }
    } finally {
      markBusy(taskId, false);
      setDraggedTaskId(null);
    }
  }

  async function completeTask(task: CrmTask, completed: boolean) {
    if (busyIds.has(task.id)) return;
    const taskSnapshot = tasks;
    const archiveSnapshot = archived;
    markBusy(task.id, true);
    if (completed) {
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setArchived((current) => [{ ...task, completedAt: new Date().toISOString() }, ...current]);
    } else {
      setArchived((current) => current.filter((item) => item.id !== task.id));
      setTasks((current) => [...current, { ...task, completedAt: null }]);
    }
    try {
      await postAction({ action: "completion", taskId: task.id, completed });
    } catch {
      setTasks(taskSnapshot);
      setArchived(archiveSnapshot);
      setMessage("Не удалось изменить статус задачи");
    } finally {
      markBusy(task.id, false);
    }
  }

  async function saveTask(draft: TaskDraft) {
    setEditorBusy(true);
    const payload = apiTask(draft);
    try {
      if (editorTask) {
        await postAction({ action: "update", taskId: editorTask.id, task: payload });
        const entityName = data.entities.find((entity) => entity.id === payload.entityId)?.name ?? null;
        const update = { ...editorTask, ...payload, entityName } as CrmTask;
        setTasks((current) => current.map((task) => task.id === update.id ? update : task));
        setArchived((current) => current.map((task) => task.id === update.id ? update : task));
      } else {
        const result = await postAction({
          action: "create",
          clientRequestId: crypto.randomUUID(),
          task: payload,
        });
        if (typeof result.taskId !== "string") throw new Error("missing_task_id");
        const now = new Date().toISOString();
        const entityName = data.entities.find((entity) => entity.id === payload.entityId)?.name ?? null;
        setTasks((current) => [...current, {
          id: result.taskId as string,
          ...payload,
          entityName,
          dueDate: null,
          completedAt: null,
          boardPosition: Date.now(),
          createdAt: now,
          updatedAt: now,
        }]);
      }
      setEditorTask(undefined);
    } catch {
      setMessage("Не удалось сохранить задачу. Проверьте подключение и повторите.");
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <div className="dashboard-page crm-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link className="active" href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats"><TopbarTicker /><time dateTime={clock.toISOString()}>{clockText(clock, data.timeZone)}</time></div>
      </header>

      {data.dataStatus === "partial" ? <div className="system-notice" role="status">CRM работает в безопасном частичном режиме. Примените последнюю миграцию или проверьте Supabase.</div> : null}
      {message ? <div className="crm-toast" role="status">{message}</div> : null}

      <main className="crm-main">
        <section className="crm-hero">
          <h1>people, <em>moving.</em></h1>
          <div className="crm-stat-grid">
            {[
              [data.stats.people, "people"],
              [tasks.length, "tasks"],
              [data.stats.content, "content"],
              [data.stats.decisions, "decisions"],
              [data.stats.captures, "captures"],
            ].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
          </div>
        </section>

        <section className="crm-toolbar" aria-label="Фильтры CRM">
          <label className="crm-search-field">
            <Icon name="search" size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={160}
              placeholder="Фильтр по названию, описанию, связи или тегу…"
              aria-label="Фильтр задач"
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить фильтр"><Icon name="close" size={12} /></button> : null}
          </label>
          <div className="crm-toolbar-actions">
            <button className={priorityOnly ? "active" : ""} type="button" onClick={() => setPriorityOnly((value) => !value)}>priority</button>
            <select value={category} onChange={(event) => setCategory(event.target.value as CrmCategory | "all")} aria-label="Категория">
              <option value="all">category</option>
              {CRM_CATEGORIES.map((item) => <option key={item} value={item}>{CRM_CATEGORY_LABELS[item]}</option>)}
            </select>
            <button className={view === "kanban" ? "active" : ""} type="button" onClick={() => setView("kanban")}>kanban</button>
            <button className={view === "archive" ? "active" : ""} type="button" onClick={() => setView("archive")}>archive</button>
            <button className={view === "smart" ? "active" : ""} type="button" onClick={() => setView("smart")}>smart</button>
            <button className="crm-new-button" type="button" onClick={() => setEditorTask(null)}><Icon name="plus" size={12} /> new</button>
          </div>
        </section>

        {view === "smart" ? (
          <section className="crm-smart-view">
            <form className="crm-smart-search" onSubmit={(event) => event.preventDefault()}>
              <input
                value={smartQuery}
                onChange={(event) => setSmartQuery(event.target.value)}
                maxLength={240}
                placeholder="Например: что поможет мне сохранить фокус на этой неделе?"
                aria-label="Умный поиск по задачам"
              />
              <button type="submit">search</button>
            </form>
            <p className="crm-smart-note">Поиск учитывает все слова запроса и проверяет название, контекст, сферу, человека и теги.</p>
            <div className="crm-smart-grid">
              {visibleTasks.length ? visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} busy={busyIds.has(task.id)} draggable={false} onEdit={() => setEditorTask(task)} onComplete={() => completeTask(task, true)} onMove={(urgency) => moveTask(task.id, urgency, null)} />
              )) : <p className="crm-empty-state">Совпадений нет. Попробуйте сократить запрос.</p>}
            </div>
          </section>
        ) : view === "archive" ? (
          <section className="crm-archive-view">
            <header><div><span>archive / completed</span><h2>Завершённые задачи</h2></div><strong>{visibleArchive.length}</strong></header>
            <div className="crm-archive-grid">
              {visibleArchive.length ? visibleArchive.map((task) => (
                <TaskCard key={task.id} task={task} busy={busyIds.has(task.id)} draggable={false} onEdit={() => setEditorTask(task)} onComplete={() => undefined} onRestore={() => completeTask(task, false)} onMove={() => undefined} />
              )) : <p className="crm-empty-state">В архиве пока нет подходящих задач.</p>}
            </div>
          </section>
        ) : (
          <DndContext
            id="crm-board"
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(event: DragStartEvent) => {
              const id = String(event.active.id);
              setDraggedTaskId(id.startsWith("task:") ? id.slice(5) : null);
            }}
            onDragCancel={() => setDraggedTaskId(null)}
            onDragEnd={(event: DragEndEvent) => {
              setDraggedTaskId(null);
              const activeId = String(event.active.id);
              const overId = event.over ? String(event.over.id) : "";
              if (!activeId.startsWith("task:") || !overId) return;
              const taskId = activeId.slice(5);
              if (overId.startsWith("column:")) {
                void moveTask(taskId, overId.slice(7) as CrmUrgency, null);
                return;
              }
              if (overId.startsWith("task:")) {
                const beforeTaskId = overId.slice(5);
                const anchor = tasks.find((task) => task.id === beforeTaskId);
                if (anchor) void moveTask(taskId, anchor.urgency, beforeTaskId);
              }
            }}
          >
            <section className="crm-board" aria-label="Канбан задач">
              {CRM_COLUMNS.map((column) => {
                const columnTasks = visibleTasks.filter((task) => task.urgency === column.id);
                return (
                  <DroppableColumn key={column.id} columnId={column.id} active={Boolean(draggedTaskId)}>
                    <header className="crm-column-head"><span>{column.shortLabel}</span><strong>{columnTasks.length}</strong></header>
                    <div className="crm-column-tasks">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          busy={busyIds.has(task.id)}
                          draggable
                          onEdit={() => setEditorTask(task)}
                          onComplete={() => completeTask(task, true)}
                          onMove={(urgency) => moveTask(task.id, urgency, null)}
                        />
                      ))}
                      {columnTasks.length === 0 ? <div className="crm-column-empty">Перетащите задачу сюда</div> : null}
                    </div>
                  </DroppableColumn>
                );
              })}
            </section>
          </DndContext>
        )}
      </main>

      {editorTask !== undefined ? <TaskEditor key={editorTask?.id ?? "new"} task={editorTask} entities={data.entities} busy={editorBusy} onClose={() => !editorBusy && setEditorTask(undefined)} onSave={saveTask} /> : null}
    </div>
  );
}
