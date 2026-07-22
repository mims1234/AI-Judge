export type StepCardProps = {
  number: string; // "01"
  title: string;
  body: string;
  glyph: React.ReactNode;
};

/** Methodology step card for the landing page (plans/08 §1.2). */
export function StepCard({ number, title, body, glyph }: StepCardProps) {
  return (
    <div className="rounded-md border border-line-subtle bg-ink-900 p-5 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-faint">{number}</span>
        <span className="text-teal-400">{glyph}</span>
      </div>
      <h3 className="mt-3 text-base text-bright">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-dim">{body}</p>
    </div>
  );
}
