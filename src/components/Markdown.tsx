import ReactMarkdown from "react-markdown";

/** Renders owner-written lesson text. Raw HTML is not rendered, so it is safe. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-academy">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
