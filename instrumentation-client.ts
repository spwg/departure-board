import { markHidden, markNavigationStart } from "@/lib/boardTiming";
import { startEarlyBoardFetch } from "@/lib/earlyBoardFetch";

startEarlyBoardFetch(location.pathname);

// Lets lib/boardTiming time a board from the start of an in-app navigation,
// and discard waits the rider did not watch.
if (document.visibilityState === "hidden") markHidden();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") markHidden();
});

export function onRouterTransitionStart(): void {
  markNavigationStart();
}
