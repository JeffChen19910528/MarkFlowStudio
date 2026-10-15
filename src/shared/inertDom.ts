/**
 * Parse an HTML fragment into an *inert* document: no scripts run and, importantly, no resources are
 * fetched. (`div.innerHTML = html` on a detached element still starts loading every `<img src>`,
 * which would send requests for relative and remote image URLs just because we inspected them.)
 */
export function inertBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html").body;
}
