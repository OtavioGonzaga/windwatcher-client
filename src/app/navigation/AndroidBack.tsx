import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { decideBack, RouteHistory } from "./back-policy";

export function AndroidBack() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const history = useRef(new RouteHistory());
  const busy = useRef(false);
  const current = useRef({ location, navigate });
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    current.current = { location, navigate };
    history.current.observe(location.key, action);
    busy.current = false;
  }, [location, navigate, action]);
  useEffect(() => {
    // Host identity is mandatory; a browser's Android user agent is not native.
    if (!isTauri() || !/Android/i.test(navigator.userAgent)) return undefined;
    const lifetime = new AbortController();
    let dispose: (() => void) | undefined;
    void import("../../shared/platform/android-back")
      .then((adapter) => {
        if (lifetime.signal.aborted) return;
        dispose = adapter.subscribeBack(
          (canGoBack) => {
            const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
            if (dialog) {
              dialog.close();
              return;
            }
            if (busy.current) return;
            busy.current = true;
            const { location: route, navigate: go } = current.current;
            const decision = decideBack(
              route.pathname === "/",
              history.current.hasPredecessor,
              canGoBack,
            );
            if (decision === "exit") {
              void adapter.finishActivity().catch(() => {
                busy.current = false;
                setFailed(true);
              });
            } else if (decision === "back") void go(-1);
            else void go("/", { replace: true });
          },
          () => setFailed(true),
        );
      })
      .catch(() => {
        if (!lifetime.signal.aborted) setFailed(true);
      });
    return () => {
      lifetime.abort();
      dispose?.();
    };
  }, []);
  return failed ? (
    <InlineNotice tone="error" announce="polite">
      {t("navigation.nativeBackError")}
    </InlineNotice>
  ) : null;
}
