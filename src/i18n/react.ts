import { useSyncExternalStore } from "react";
import { type Language, getLanguage, subscribeLanguage, t } from "./index";

/** The current language; the component re-renders when it changes. */
export const useLanguage = (): Language => useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);

/** `t`, but subscribed: call it at the top of any component that shows text. */
export function useT(): typeof t {
  useLanguage();
  return t;
}
