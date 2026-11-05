export function assertGeneratedTypes(actual: string, expected: string): void {
  if (actual !== expected) throw new Error("API types are stale. Run bun run api:generate.");
}
