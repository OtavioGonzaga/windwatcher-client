export type FailureCategory =
  | "http"
  | "invalid-response"
  | "response-too-large"
  | "timeout"
  | "cancelled"
  | "transport"
  | "redirect";

export interface FailureMetadata {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
}

/** Never retains raw URLs, request bodies, server prose or transport causes. */
export class ApiError extends Error {
  readonly category: FailureCategory;
  readonly metadata: Readonly<FailureMetadata>;

  constructor(category: FailureCategory, metadata: FailureMetadata = {}) {
    super(`API request failed (${category}).`);
    this.name = "ApiError";
    this.category = category;
    this.metadata = Object.freeze({ ...metadata });
  }
}

/** RFC delay-seconds or HTTP-date, never a retry policy. */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  // Date.parse alone accepts non-HTTP strings such as "1" and "-1".
  if (
    !/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(
      text,
    )
  )
    return undefined;
  let parseable = text;
  const rfc850 = /^([A-Z][a-z]+), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/.exec(
    text,
  );
  if (rfc850) {
    // HTTP's two-digit year is relative to receipt, not Date.parse's fixed
    // 1950/2050 pivot. A date >50 years ahead denotes the preceding century.
    const currentYear = new Date(now).getUTCFullYear();
    let year = currentYear + ((Number(rfc850[4]) - (currentYear % 100) + 100) % 100);
    if (year > currentYear + 50) year -= 100;
    parseable = `${rfc850[1]?.slice(0, 3)}, ${rfc850[2]} ${rfc850[3]} ${year} ${rfc850[5]} GMT`;
  }
  // asctime-form is also GMT per HTTP, not the machine's local timezone.
  const instant = Date.parse(parseable.endsWith("GMT") ? parseable : `${parseable} GMT`);
  if (!Number.isFinite(instant)) return undefined;
  const date = new Date(instant);
  const canonical = date.toUTCString();
  const [weekday, day, month, year, time] = canonical.split(" ");
  const longDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    date.getUTCDay()
  ];
  const obsolete = `${longDay}, ${day}-${month}-${year?.slice(-2)} ${time} GMT`;
  const asctime = `${weekday?.slice(0, 3)} ${month} ${String(date.getUTCDate()).padStart(2, " ")} ${time} ${year}`;
  // Reject impossible calendar dates and weekday mismatches normalized by Date.parse.
  if (![canonical, obsolete, asctime].includes(text)) return undefined;
  return Math.max(0, instant - now);
}
