import { type ReactNode, createContext, useContext } from "react";
import { browserPlatform } from "./browser";
import type { Platform } from "./types";

const PlatformContext = createContext<Platform>(browserPlatform);

/** Supply a different platform (tests, or a desktop shell). Without a provider the browser platform is used. */
export function PlatformProvider({ value, children }: { value: Platform; children: ReactNode }) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export const usePlatform = (): Platform => useContext(PlatformContext);
