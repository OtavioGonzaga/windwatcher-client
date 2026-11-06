import { useTranslation } from "react-i18next";
import { storageError } from "../../shared/storage/errors";
export function StorageNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return <p role="alert">{t(`profiles.errors.${storageError(error).category}`)}</p>;
}
