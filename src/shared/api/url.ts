export type ServerUrlErrorReason =
  | "scheme"
  | "credentials"
  | "queryFragment"
  | "apiRoot"
  | "invalid";

export class ServerUrlError extends TypeError {
  constructor(readonly reason: ServerUrlErrorReason) {
    super(
      "Invalid server URL; supply an HTTP(S) server root without /v1, credentials, query or fragment.",
    );
  }
}

/** A validated server root, including any reverse-proxy prefix (never /v1). */
export class ServerUrl {
  readonly #href: string;

  private constructor(href: string) {
    this.#href = href;
  }

  static parse(input: string): ServerUrl {
    const invalid = () => new ServerUrlError("invalid");
    // Inspect before WHATWG URL normalization erases dot segments/backslashes.
    const parts = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(input);
    if (/[\s\\]/u.test(input) || hasControl(input)) throw invalid();
    if (!/^https?:\/\//i.test(input)) throw new ServerUrlError("scheme");
    if (/[?#]/.test(input)) throw new ServerUrlError("queryFragment");
    if (parts?.[2]?.includes("@")) throw new ServerUrlError("credentials");
    if (!parts) throw invalid();
    const path = parts[3] ?? "/";
    const segments = path.split("/").slice(1);
    if (segments.at(-1) === "") segments.pop();
    let decoded: string[];
    try {
      decoded = segments.map((segment) => decodeURIComponent(segment));
    } catch {
      throw invalid();
    }
    if (
      decoded.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          /[/%\\]/u.test(segment) ||
          hasControl(segment),
      )
    ) {
      throw invalid();
    }
    if (decoded.at(-1) === "v1") throw new ServerUrlError("apiRoot");
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw invalid();
    }
    if (!url.hostname || url.username || url.password) throw invalid();
    url.pathname = decoded.length ? `/${decoded.map(encodeURIComponent).join("/")}/` : "/";
    return new ServerUrl(url.href);
  }

  toString(): string {
    return this.#href;
  }
}

function hasControl(text: string): boolean {
  return Array.from(text).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function apiUrl(
  base: ServerUrl,
  segments: readonly string[],
  query: Readonly<Record<string, string>> = {},
): URL {
  if (
    !segments.length ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new TypeError("API endpoint segments must be nonempty and cannot traverse paths.");
  }
  const url = new URL(base.toString());
  url.pathname += ["v1", ...segments.map(encodeURIComponent)].join("/");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}
