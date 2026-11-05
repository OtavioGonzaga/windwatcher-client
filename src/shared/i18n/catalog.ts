type Tree = { [key: string]: string | Tree };

export function flattenCatalog(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [[path, value]]
        : Object.entries(flattenCatalog(value, path));
    }),
  );
}

const variables = (value: string) =>
  Array.from(value.matchAll(/{{\s*([\w]+)\s*}}/g), (match) => match[1])
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""))
    .join(",");

/** Full parity includes plural suffixes and interpolation variables, not just key count. */
export function auditCatalog(reference: Tree, candidate: Tree): string[] {
  const expected = flattenCatalog(reference);
  const actual = flattenCatalog(candidate);
  const errors: string[] = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const value = actual[key];
    if (!(key in expected)) errors.push(`Unexpected key: ${key}`);
    else if (typeof value !== "string" || !value.trim())
      errors.push(`Missing/empty translation: ${key}`);
    else if (value === key || value === key.split(".").at(-1))
      errors.push(`Untranslated key: ${key}`);
    else if (variables(expected[key]!) !== variables(value))
      errors.push(`Interpolation mismatch: ${key}`);
  }
  return errors;
}
