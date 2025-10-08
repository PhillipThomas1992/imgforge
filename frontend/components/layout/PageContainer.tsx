"use client";

import DarkVeil from "@/components/DarkVeil";
import { Header } from "@/components/Header";

export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Global background */}
      <div className="fixed inset-0 -z-10">
        <DarkVeil
          hueShift={210}
          scanlineFrequency={1}
          scanlineIntensity={0.2}
        />
      </div>

      {/* Header */}
      <Header />

      {/* Page content */}
      <main className="relative z-10 min-h-screen overflow-hidden">
        {children}
      </main>
    </>
  );
}
