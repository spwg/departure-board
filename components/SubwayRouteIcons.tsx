import { subwayRouteColor } from "@/lib/subway";

const LIGHT_TEXT_ROUTES = new Set(["N", "Q", "R", "W"]);

/** Provider-native MTA route bullets for a visible route label. */
export function SubwayRouteIcons({
  routes,
  size = "sm",
}: {
  routes: string[];
  size?: "sm" | "md";
}) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      {routes.map((route) => (
        <span
          key={route}
          className={`grid place-items-center rounded-full font-bold leading-none ${size === "md" ? "h-6 w-6 text-xs" : "h-5 w-5 text-[0.65rem]"}`}
          style={{
            backgroundColor: subwayRouteColor(route),
            color: LIGHT_TEXT_ROUTES.has(route) ? "#18181b" : "#ffffff",
          }}
        >
          {route}
        </span>
      ))}
    </span>
  );
}
