"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, CheckSquare, Square } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  if (!content || !content.trim()) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No description provided.
      </p>
    );
  }

  return (
    <div className={`markdown-content prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-foreground ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="mt-6 mb-3 text-xl sm:text-2xl font-extrabold tracking-tight text-foreground border-b border-border/40 pb-2 first:mt-0"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="mt-5 mb-2.5 text-lg sm:text-xl font-bold tracking-tight text-foreground border-b border-border/30 pb-1.5 first:mt-0"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="mt-4 mb-2 text-base sm:text-lg font-semibold text-foreground first:mt-0"
              {...props}
            />
          ),
          h4: ({ node, ...props }) => (
            <h4
              className="mt-3 mb-1.5 text-sm sm:text-base font-semibold text-foreground first:mt-0"
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-3 leading-relaxed text-foreground/90 last:mb-0" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="mb-3 list-disc pl-5 space-y-1 text-foreground/90" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="mb-3 list-decimal pl-5 space-y-1 text-foreground/90" {...props} />
          ),
          li: ({ node, children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-3 rounded-r-xl border-l-4 border-primary bg-primary/5 py-2 px-4 text-xs italic text-foreground/85"
              {...props}
            />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground border border-border/60"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-border/80 bg-muted/40 p-3.5 font-mono text-xs text-foreground shadow-xs">
                <pre {...props}>
                  <code>{children}</code>
                </pre>
              </div>
            );
          },
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-border/80">
              <table className="w-full text-left text-xs border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-muted/60 border-b border-border font-semibold text-foreground" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-border/40" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-muted/20 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-3.5 py-2.5 font-semibold text-foreground" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3.5 py-2 text-foreground/90" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-5 border-border/60" {...props} />
          ),
          a: ({ node, href, children, ...props }) => {
            const isExternal = href?.startsWith("http") || href?.startsWith("//");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                {...props}
              >
                {children}
                {isExternal && <ExternalLink className="h-3 w-3 inline-block shrink-0" />}
              </a>
            );
          },
          input: ({ node, type, checked, ...props }: any) => {
            if (type === "checkbox") {
              return (
                <span className="inline-flex items-center mr-1.5 align-middle">
                  {checked ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </span>
              );
            }
            return <input type={type} checked={checked} {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
