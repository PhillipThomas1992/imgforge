"use client";

import { FlashImageWizard } from "@/components/wizards/flash-image-wizard";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function FlashPageContent() {
  const searchParams = useSearchParams();
  const preSelectedImage = searchParams.get("image");

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <FlashImageWizard
        onBack={() => window.location.assign("/")}
        preSelectedImage={preSelectedImage || undefined}
      />
      <p className="text-sm text-slate-400 mt-8">
        <Link href="/" className="underline hover:text-white">
          ← Back to landing
        </Link>
      </p>
    </div>
  );
}

export default function FlashPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-slate-400">Loading...</p>
          </div>
        </div>
      }
    >
      <FlashPageContent />
    </Suspense>
  );
}
