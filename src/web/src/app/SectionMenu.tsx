import Link from "next/link";

export type Section = { href: string; key: string; label: string; testId?: string };

// Tabs for the pages of one area. Test ids are <id> and <item>-<key>, unless a section sets its own.
export function SectionMenu({
  id,
  item = id,
  label,
  sections,
  active,
  className = "mb-4",
}: {
  id: string;
  item?: string;
  label: string;
  sections: readonly Section[];
  active: string | null;
  className?: string;
}) {
  return (
    <nav className={`nav nav-tabs ${className}`} aria-label={label} data-testid={id}>
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          data-testid={section.testId ?? `${item}-${section.key}`}
          className={`nav-link${section.key === active ? " active" : ""}`}
          aria-current={section.key === active ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
