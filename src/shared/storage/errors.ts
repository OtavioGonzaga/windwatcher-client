export type StorageCategory =
  | "unavailable"
  | "locked"
  | "corrupt"
  | "write-failed"
  | "permission-denied"
  | "version-unsupported"
  | "conflict"
  | "quota"
  | "too-large"
  | "duplicate";
export class StorageError extends Error {
  constructor(readonly category: StorageCategory) {
    super(category);
    this.name = "StorageError";
  }
}
function isCategory(error: unknown): error is StorageCategory {
  return (
    typeof error === "string" &&
    [
      "unavailable",
      "locked",
      "corrupt",
      "write-failed",
      "permission-denied",
      "version-unsupported",
      "conflict",
      "quota",
      "too-large",
      "duplicate",
    ].includes(error)
  );
}
export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (isCategory(error)) return new StorageError(error);
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return new StorageError("quota");
    if (error.name === "SecurityError" || error.name === "NotAllowedError")
      return new StorageError("permission-denied");
  }
  return new StorageError("unavailable");
}
