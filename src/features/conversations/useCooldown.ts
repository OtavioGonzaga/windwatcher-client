import { useEffect, useState } from "react";

export function useCooldown(until: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (until <= now) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(until - now, 1000));
    return () => clearTimeout(timer);
  }, [until, now]);
  return { waiting: until > now, seconds: Math.max(0, Math.ceil((until - now) / 1000)) };
}
