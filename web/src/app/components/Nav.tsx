"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Console" },
  { href: "/builder", label: "Policy Builder" },
  { href: "/scenarios", label: "Scenario Studio" },
  { href: "/log", label: "Decision Log" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-brand">
          <span className="app-brand-mark">▚</span>
          <span className="app-brand-name">Beyond the Score</span>
        </Link>
        <div className="app-nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={"app-nav-link" + (path === l.href ? " on" : "")}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
