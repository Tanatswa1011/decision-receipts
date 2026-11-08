"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Polls /api/live/status every 2 s and refreshes the server-rendered page when new events arrive. */
export function LiveRefresher() {
  const router = useRouter();
  const last = useRef<number | null>(null);
  const [info, setInfo] = useState<{ events: number; running: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await (await fetch("/api/live/status", { cache: "no-store" })).json();
        if (!alive) return;
        setInfo({ events: s.events, running: Boolean(s.job?.running) });
        if (last.current !== null && s.events !== last.current) router.refresh();
        last.current = s.events;
      } catch { /* server restarting: try again next tick */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [router]);
  return (
    <span className="livebadge" title="Updates every 2 seconds from POST /api/events">
      <span className="live-dot" />Live{info ? ` · ${info.events} events${info.running ? " · receiving…" : ""}` : ""}
    </span>
  );
}
