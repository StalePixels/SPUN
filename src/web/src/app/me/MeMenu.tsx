import { SectionMenu } from "../SectionMenu";

const PAGES = [
  { href: "/me", key: "account", label: "Your account" },
  { href: "/me/apps", key: "apps", label: "My Apps" },
  { href: "/me/keys", key: "keys", label: "API keys" },
] as const;

export function MeMenu({ active }: { active: (typeof PAGES)[number]["key"] }) {
  return <SectionMenu id="me-menu" label="Your account" sections={PAGES} active={active} />;
}
