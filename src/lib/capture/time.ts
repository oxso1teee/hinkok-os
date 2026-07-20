export type LocalCaptureTime = {
  date: string;
  time: string;
  isoWithOffset: string;
};

function partsMap(
  date: Date,
  timeZone: string,
): Map<Intl.DateTimeFormatPartTypes, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });

  return new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function localCaptureTime(
  date: Date,
  timeZone: string,
): LocalCaptureTime {
  const parts = partsMap(date, timeZone);
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const second = parts.get("second");
  const offsetName = parts.get("timeZoneName") ?? "GMT+00:00";
  const offset = offsetName.replace("GMT", "") || "+00:00";

  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error("Unable to resolve local capture time");
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    isoWithOffset: `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`,
  };
}
