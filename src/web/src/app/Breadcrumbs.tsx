import Link from "next/link";

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="breadcrumb">
      <ol
        className="breadcrumb"
        style={{ "--bs-breadcrumb-divider": "'›'" } as React.CSSProperties}
      >
        {items.map((item, index) =>
          item.href ? (
            <li key={index} className="breadcrumb-item">
              <Link href={item.href}>{item.label}</Link>
            </li>
          ) : (
            <li key={index} className="breadcrumb-item active" aria-current="page">
              {item.label}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
