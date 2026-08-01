export default function Footer() {
  return (
    <footer className="mt-auto py-8 px-4 text-center text-sm text-foreground-muted">
      Built with{" "}
      <a
        href="https://nextjs.org"
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:text-primary-hover"
      >
        Next.js
      </a>{" "}
      +{" "}
      <a
        href="https://tailwindcss.com"
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:text-primary-hover"
      >
        Tailwind CSS
      </a>{" "}
      on{" "}
      <a
        href="https://huggingface.co/spaces"
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:text-primary-hover"
      >
        Hugging Face Spaces
      </a>{" "}
      · Runs on ZeroGPU · Model by{" "}
      <a
        href="https://huggingface.co/baidu"
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:text-primary-hover"
      >
        Baidu
      </a>
      , released under MIT.
    </footer>
  );
}
