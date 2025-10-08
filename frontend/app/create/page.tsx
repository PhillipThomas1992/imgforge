"use client";

import { CreateImageWizard } from "@/components/wizards/CreateImage";
import Link from "next/link";

export default function CreatePage() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <CreateImageWizard onBack={() => window.location.assign("/")} />
      <p className="text-sm text-slate-400 mt-8">
        <Link href="/" className="underline hover:text-white">
          ← Back to landing
        </Link>
      </p>
    </div>
  );
}
