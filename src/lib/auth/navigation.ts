export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login") ||
    value.includes("\\") ||
    value.includes("\u0000")
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "https://hinkok.local");
    if (parsed.origin !== "https://hinkok.local") {
      return "/";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
