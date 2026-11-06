export type StorageCategory =
  | "unavailable"
  | "locked"
  | "corrupt"
  | "write-failed"
  | "permission-denied"
  | "version-unsupported"
  | "conflict"
  | "quota"
  | "duplicate";
export class StorageError extends Error {
  constructor(readonly category: StorageCategory) {
    super(category);
    this.name = "StorageError";
  }
}
export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (
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
      "duplicate",
    ].includes(error)
  )
    return new StorageError(error as StorageCategory);
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return new StorageError("quota");
    if (error.name === "SecurityError" || error.name === "NotAllowedError")
      return new StorageError("permission-denied");
  }
  return new StorageError("unavailable");
}
