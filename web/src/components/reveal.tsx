/**
 * Görünüme girerken yumuşakça belirir (bkz. .reveal ve .reveal-load, globals.css).
 * onLoad: ilk ekrandaki öğeler için; sayfa açılışında sırayla gelir.
 */
export function Reveal({
  children,
  delay = 0,
  onLoad = false,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  onLoad?: boolean;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <Tag className={`${onLoad ? "reveal-load" : "reveal"} ${className}`} style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}>
      {children}
    </Tag>
  );
}
