import { SectionMenu } from "../SectionMenu";

const PAGES = [
  { href: "/publish", key: "apps", label: "Your apps" },
  { href: "/publish/new", key: "new", label: "New app" },
  { href: "/publish/docs", key: "docs", label: "Release zips" },
] as const;

export function PublishMenu({ active }: { active: (typeof PAGES)[number]["key"] }) {
  return <SectionMenu id="publish-menu" label="Publish" sections={PAGES} active={active} />;
}
