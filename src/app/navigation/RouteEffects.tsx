import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavigationType, useLocation, useNavigationType } from "react-router";

type Position = { x: number; y: number; focusId: string };

/** Restore only entries observed by this mounted app; never steal initial focus. */
export function RouteEffects() {
  const location = useLocation();
  const action = useNavigationType();
  const { i18n } = useTranslation();
  const previous = useRef(location.key);
  const positions = useRef(new Map<string, Position>());
  useLayoutEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = restoration;
    };
  }, []);
  useLayoutEffect(() => {
    const heading = document.getElementById("route-heading");
    if (previous.current !== location.key) {
      const saved = action === NavigationType.Pop ? positions.current.get(location.key) : undefined;
      const target = (saved?.focusId ? document.getElementById(saved.focusId) : null) ?? heading;
      target?.focus({ preventScroll: true });
      window.scrollTo(saved?.x ?? 0, saved?.y ?? 0);
      previous.current = location.key;
    }
    const remember = () => {
      positions.current.set(location.key, {
        x: window.scrollX,
        y: window.scrollY,
        focusId: document.activeElement?.id ?? "",
      });
      if (positions.current.size > 50)
        positions.current.delete(positions.current.keys().next().value!);
    };
    window.addEventListener("scroll", remember, { passive: true });
    document.addEventListener("focusin", remember);
    return () => {
      window.removeEventListener("scroll", remember);
      document.removeEventListener("focusin", remember);
    };
  }, [location.key, action]);
  useLayoutEffect(() => {
    const title = document.getElementById("route-heading")?.textContent ?? "Windwatcher";
    document.title = title === "Windwatcher" ? title : `${title} — Windwatcher`;
    // The heading is read from the committed DOM, which changes with route/locale.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [location.key, i18n.resolvedLanguage]);
  return null;
}
