import { useDeferredValue, useMemo } from "react";
import { localImageSrcs } from "../../markdown/imageRefs";
import { type OutlineItem, buildOutline } from "../../markdown/outline";

/**
 * Facts derived from the document text for the side panel. Computed from a deferred copy of the text
 * so typing stays responsive on large documents.
 */
export function useDocumentInsights(markdown: string): { outline: OutlineItem[]; localImageCount: number } {
  const deferred = useDeferredValue(markdown);
  const outline = useMemo(() => buildOutline(deferred), [deferred]);
  const localImageCount = useMemo(() => localImageSrcs(deferred).length, [deferred]);
  return { outline, localImageCount };
}
