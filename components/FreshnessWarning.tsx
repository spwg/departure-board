"use client";

import { useEffect, useState } from "react";

const AGE_TICK_MS = 15_000;

export function FreshnessWarning({ lastLiveAt }: { lastLiveAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <p
      role="status"
      className="border-b border-edge bg-warn-soft px-5 py-2 text-center text-xs font-medium text-warn"
    >
      Data is no longer live — last updated {formatAge(now - lastLiveAt)}
    </p>
  );
}

function formatAge(elapsedMs: number) {
  const minutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (minutes === 0) return "less than a minute ago";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
