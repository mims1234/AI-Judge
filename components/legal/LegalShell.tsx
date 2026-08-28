import Link from "next/link";
import {
  CONTACT_DISCORD_ID,
  CONTACT_DISCORD_NAME,
  CONTACT_DISCORD_URL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LINKS,
  OPERATOR_NAME,
} from "@/lib/legal";

export function LegalShell({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 md:px-10 [&_a]:text-teal-300 [&_a:hover]:text-teal-200">
      <header className="border-b border-line-subtle pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-teal-400">
          {kicker}
        </p>
        <h1 className="mt-3 font-display text-4xl uppercase leading-[1.1] tracking-[0.08em] text-bright">
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-body">{lede}</p>
        <p className="mt-3 font-mono text-xs text-dim">
          Effective {LEGAL_EFFECTIVE_DATE} · Last updated {LEGAL_EFFECTIVE_DATE} ·
          Operator {OPERATOR_NAME}
        </p>
      </header>
      <div className="flex flex-col gap-8 py-8">{children}</div>
      <footer className="border-t border-line-subtle pt-6">
        <p className="text-sm leading-6 text-dim">
          Questions: Discord{" "}
          <a
            href={CONTACT_DISCORD_URL}
            className="text-teal-300 hover:text-teal-200"
          >
            {CONTACT_DISCORD_NAME}
          </a>{" "}
          <span className="font-mono text-faint">({CONTACT_DISCORD_ID})</span>
          .{" "}
          {LEGAL_LINKS.map((link, i) => (
            <span key={link.href}>
              {i > 0 ? <span className="text-faint"> · </span> : null}
              <Link href={link.href} className="text-teal-300 hover:text-teal-200">
                {link.label}
              </Link>
            </span>
          ))}
        </p>
      </footer>
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xl text-bright">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-7 text-body">{children}</p>;
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-7 text-body">
          <span
            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400"
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
