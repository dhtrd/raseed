import { useCallback, useSyncExternalStore } from "react";

/** يتابع استعلام وسائط CSS (مثل «(width <= 600px)»)، ويتحدث عند تغيّر العرض أو تدوير الجهاز. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
