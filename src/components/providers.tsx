"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { StaleOverlayGuard } from "@/components/stale-overlay-guard";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <StaleOverlayGuard />
      {children}
    </SessionProvider>
  );
}
