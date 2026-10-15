import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

/**
 * Single shared render configuration. Raw HTML in the source is disabled (it is shown as
 * escaped text) and the output is additionally sanitised, so preview never executes scripts.
 * Phase 3 HTML export must reuse this function so preview and export agree.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });

// Open external links safely.
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("rel", "noopener noreferrer");
  tokens[idx].attrSet("target", "_blank");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
  FORBID_ATTR: ["style", "srcset"],
  ADD_ATTR: ["target"],
};

/** Token stream from the same parser, for exporters that need structure (e.g. plain text). */
export const parseMarkdown = (source: string) => md.parse(source, {});

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), PURIFY_CONFIG) as unknown as string;
}
