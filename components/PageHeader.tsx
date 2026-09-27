/**
 * Every card header's height. A station header holds exactly this, because
 * Subway direction headings pin directly beneath it on phones; other headers
 * start here and grow when a long title wraps.
 */
export const PAGE_HEADER_HEIGHT = "4.5rem";

/**
 * The bar across the top of a page's card: Home, the page's name, and its
 * controls. One component so every page gets the same breathing room.
 * `sticky` keeps it on screen while a phone scrolls the page (loading
 * placeholders pass false); `fixedHeight` is for headers that must never grow.
 */
export function PageHeader({
  children,
  sticky = true,
  fixedHeight = false,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  fixedHeight?: boolean;
}) {
  return (
    <header
      className={`flex items-center gap-1 border-b border-edge px-3 sm:px-4 ${fixedHeight ? "" : "py-3"} ${
        sticky ? "sticky top-0 z-10 bg-surface sm:static" : ""
      }`}
      style={fixedHeight ? { height: PAGE_HEADER_HEIGHT } : { minHeight: PAGE_HEADER_HEIGHT }}
    >
      {children}
    </header>
  );
}
