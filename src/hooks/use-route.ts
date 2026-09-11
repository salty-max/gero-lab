import { useEffect, useState } from "react";

import { parseHash, type Route } from "@/lib/route";

/** The view the hash currently names. Updates on `hashchange`. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(globalThis.location?.hash ?? ""),
  );
  useEffect(() => {
    const onHash = () => setRoute(parseHash(globalThis.location.hash));
    globalThis.addEventListener("hashchange", onHash);
    return () => globalThis.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
