import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { BrandLockup } from "../Brand";

/*
 * SmileCompose surfaces (styles in src/app/surfaces.css).
 *
 *   Level 0  PageSurface          the white / near-black canvas
 *   Level 1  FloatingCard …       cards that float on soft elevation
 *   Level 2  BottomSheetSurface   sheets, menus and overlays
 *
 * Screens that predate these components carry the same classes
 * (sc-card, sc-grouped, …) or are mapped onto them in surfaces.css,
 * so every screen reads from one set of tokens.
 */

type Polymorphic<E extends ElementType> = { as?: E; className?: string; children?: ReactNode } & Omit<ComponentPropsWithoutRef<E>, "as" | "className" | "children">;

function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

/** Level 0: the page canvas, with a comfortable reading width on iPad and desktop. */
export function PageSurface<E extends ElementType = "div">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("sc-page", className)} {...rest} />;
}

/** Level 1: the standard floating card. */
export function FloatingCard<E extends ElementType = "div">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("sc-card", className)} {...rest} />;
}

/** Level 1, emphasised: the one card a screen leads with (larger radius and padding). */
export function HeroFloatingCard<E extends ElementType = "div">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("sc-card", "sc-card-hero", className)} {...rest} />;
}

/** Level 1, compact: a single tappable row — icon, title, detail, chevron. */
export function ActionCard<E extends ElementType = "button">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "button") as ElementType;
  return <Tag className={cx("sc-card", "sc-action-card", "sc-pressable", className)} {...(Tag === "button" && !("type" in rest) ? { type: "button" } : {})} {...rest} />;
}

/** Level 1: rows that share one card, separated by hairline dividers. */
export function GroupedCard<E extends ElementType = "div">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("sc-card", "sc-grouped", className)} {...rest} />;
}

/** A small thin-line icon on a soft champagne (Light) or dark (Dark) disc. */
export function IconBadge({ children, size = "md", className }: { children: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return <span className={cx("sc-icon-badge", `sc-icon-badge-${size}`, className)} aria-hidden="true">{children}</span>;
}

/** The quiet label above a group of cards. */
export function SectionLabel<E extends ElementType = "h2">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "h2") as ElementType;
  return <Tag className={cx("sc-section-label", className)} {...rest} />;
}

/** A round control that floats on the canvas: back, more, close. */
export function FloatingNavButton({ className, children, ...rest }: ComponentPropsWithoutRef<"button">) {
  return <button type="button" className={cx("sc-float-button", "sc-pressable", className)} {...rest}>{children}</button>;
}

/** Level 2: the surface of sheets, menus and dialogs. */
export function BottomSheetSurface<E extends ElementType = "div">({ as, className, ...rest }: Polymorphic<E>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("sc-sheet", className)} {...rest} />;
}

/**
 * The top bar: controls on the far left and far right, SMILECOMPOSE centred on
 * the bar itself. The wordmark is positioned independently of the side
 * controls, so it never drifts when one side is wider than the other.
 * `below` sits centred under the wordmark (the Test mode pill).
 */
export function CenteredBrandHeader({ left, right, below, inverse = false, className, as = "header" }: {
  left?: ReactNode;
  right?: ReactNode;
  below?: ReactNode;
  inverse?: boolean;
  className?: string;
  as?: "header" | "div";
}) {
  const Tag = as;
  return (
    <Tag className={cx("sc-brand-header", className)}>
      <div className="sc-brand-header-start nav-group">{left}</div>
      <div className="sc-brand-header-centre">
        <BrandLockup inverse={inverse} />
        {below}
      </div>
      <div className="sc-brand-header-end">{right}</div>
    </Tag>
  );
}
