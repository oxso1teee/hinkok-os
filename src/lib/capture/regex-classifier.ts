import {
  type CaptureClassification,
  type CaptureKind,
  type LifeSphere,
  type KnownEntity,
  type TaskUrgency,
} from "@/lib/capture/schema";
import { normalizeClassification } from "@/lib/capture/normalize";

function matches(text: string, pattern: RegExp): boolean {
  const wordStartPattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])(?:${pattern.source})(?![\\p{L}\\p{N}_])`,
    pattern.flags,
  );

  return wordStartPattern.test(text);
}

function detectKind(text: string): CaptureKind {
  if (
    matches(
      text,
      /(?:встреча|созвон|звонок|мероприятие|appointment|meeting).*(?:\d{1,2}[:.]\d{2}|сегодня|завтра|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/iu,
    )
  ) {
    return "event";
  }

  if (
    matches(
      text,
      /(?:завтрак|обед|ужин|перекус|поел|поела|съел|съела|выпил|выпила|еда|блюдо|meal|breakfast|lunch|dinner|snack)/iu,
    )
  ) {
    return "meal";
  }

  if (
    matches(
      text,
      /(?:я чувствую|чувствую себя|мо[её] настроение|сегодня я|дневник|рефлекси\p{L}*|journal|i feel|my mood)/iu,
    )
  ) {
    return "journal";
  }

  if (matches(text, /(?:решил|решила|решение|decision|decided)/iu)) {
    return "decision";
  }

  if (matches(text, /(?:идея|придумал|придумала|idea|what if)/iu)) {
    return "idea";
  }

  if (
    matches(
      text,
      /(?:нужно|надо|необходимо|сделать|купить|позвонить|написать|отправить|подготовить|проверить|напомни|задача|todo|need to|must|call|send|prepare|check)/iu,
    )
  ) {
    return "task";
  }

  if (
    matches(text, /(?:контент|ролик|сценарий|пост|reels|shorts|video|content)/iu)
  ) {
    return "content";
  }

  if (
    matches(text, /(?:познакомился|познакомилась|контакт|человек|person|met)/iu)
  ) {
    return "person";
  }

  return "note";
}

function detectUrgency(text: string): TaskUrgency {
  if (matches(text, /(?:сегодня|срочно|today|urgent|asap)/iu)) {
    return "today";
  }

  if (matches(text, /(?:завтра|tomorrow)/iu)) {
    return "tomorrow";
  }

  if (matches(text, /(?:на следующей неделе|next week)/iu)) {
    return "next_week";
  }

  if (matches(text, /(?:на этой неделе|до конца недели|this week)/iu)) {
    return "this_week";
  }

  if (matches(text, /(?:в этом месяце|до конца месяца|this month)/iu)) {
    return "this_month";
  }

  return "someday";
}

function detectSphere(text: string, kind: CaptureKind): LifeSphere {
  const spherePatterns: Array<[LifeSphere, RegExp]> = [
    ["finance", /(?:деньги|денег|бюджет\p{L}*|налог\p{L}*|инвест\p{L}*|оплат\p{L}*|финанс\p{L}*|money|budget|tax)/iu],
    ["health", /(?:здоров\p{L}*|трениров\p{L}*|сон|сна|еда|калори\p{L}*|врач\p{L}*|бег\p{L}*|health|workout|sleep)/iu],
    ["content", /(?:контент\p{L}*|ролик\p{L}*|сценари\p{L}*|пост\p{L}*|reels|shorts|video|content)/iu],
    ["relationships", /(?:семь\p{L}*|друг\p{L}*|партн[её]р\p{L}*|отношени\p{L}*|family|friend|relationship)/iu],
    ["growth", /(?:курс\p{L}*|книг\p{L}*|учить|навык\p{L}*|обучени\p{L}*|course|book|learn|skill)/iu],
    ["mind", /(?:фокус\p{L}*|эмоци\p{L}*|стресс\p{L}*|психолог\p{L}*|медитац\p{L}*|focus|emotion|stress|mind)/iu],
    ["spirituality", /(?:смысл\p{L}*|ценност\p{L}*|духов\p{L}*|purpose|meaning|values)/iu],
    ["work", /(?:работ\p{L}*|клиент\p{L}*|бизнес\p{L}*|проект\p{L}*|договор\p{L}*|work|client|business|project)/iu],
  ];

  if (kind === "meal") {
    return "health";
  }

  for (const [sphere, pattern] of spherePatterns) {
    if (matches(text, pattern)) {
      return sphere;
    }
  }

  return "personal";
}

function detectTimeEstimate(text: string): number | null {
  const match = text.match(
    /(?:^|[^\p{L}\p{N}_])(\d{1,3})\s*(мин(?:ут[ыау]?)?|min(?:ute)?s?|час(?:а|ов)?|hour?s?)/iu,
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const isHours = /час|hour/iu.test(match[2]);
  const minutes = isHours ? amount * 60 : amount;
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}

export function classifyWithRegex(
  text: string,
  knownEntities: KnownEntity[],
): CaptureClassification {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const kind = detectKind(normalizedText);
  const sphere = detectSphere(normalizedText, kind);
  const urgency = kind === "task" ? detectUrgency(normalizedText) : "someday";
  const knownEntity = knownEntities.find((entity) =>
    normalizedText.toLocaleLowerCase("ru").includes(
      entity.name.toLocaleLowerCase("ru"),
    ),
  );

  return normalizeClassification(
    {
      kind,
      title: normalizedText,
      summary: normalizedText,
      urgency,
      sphere,
      key: matches(
        normalizedText,
        /(?:критично|срочно|важно|блокер|ключев\p{L}*|приоритет|critical|urgent|important|priority|blocker|⭐|★|\*{2,})/iu,
      ),
      tags: [kind, sphere],
      entity_id: knownEntity?.id ?? null,
      time_estimate_min:
        kind === "task" ? detectTimeEstimate(normalizedText) : null,
      event_start: null,
      event_end: null,
    },
    text,
    knownEntities,
  );
}
