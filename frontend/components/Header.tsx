const MODEL_URL = "https://huggingface.co/baidu/Unlimited-OCR";

const BADGES = [
  { label: "🤗 Model card", href: MODEL_URL },
  { label: "⚙️ GitHub", href: "https://github.com/baidu/Unlimited-OCR" },
  { label: "📄 Paper", href: "https://arxiv.org/abs/2606.23050" },
  { label: "⚖️ MIT License", href: `${MODEL_URL}/blob/main/LICENSE` },
];

export default function Header() {
  return (
    <header className="text-center pt-10 pb-6 px-4">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center justify-center gap-2">
        <span aria-hidden>🔎</span> Unlimited-OCR
      </h1>
      <p className="mt-2 text-foreground-muted text-base sm:text-lg">
        One-shot, long-horizon document parsing — powered by{" "}
        <a
          href={MODEL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:text-primary-hover underline underline-offset-2"
        >
          baidu/Unlimited-OCR
        </a>
      </p>
      <nav className="mt-4 flex flex-wrap justify-center gap-2">
        {BADGES.map((b) => (
          <a
            key={b.label}
            href={b.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-sm font-medium text-foreground hover:bg-surface hover:border-primary transition-colors"
          >
            {b.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
