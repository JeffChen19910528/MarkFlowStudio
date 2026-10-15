/** Scroll the preview to the n-th heading (the same index the outline uses). */
export function scrollPreviewToHeading(preview: HTMLElement | null, index: number): void {
  preview?.querySelectorAll("h1,h2,h3,h4,h5,h6")[index]?.scrollIntoView?.({ block: "start" });
}
