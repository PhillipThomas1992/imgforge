"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-white/20 backdrop-blur-sm bg-background/40",
      )}
    >
      <div className="container mx-auto px-6 py-0">
        <Link
          href="/"
          className="relative rounded-lg overflow-hidden shrink-0 hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center gap-3">
            <Image
              src="/imgforge.png"
              alt="imgforge"
              width={80}
              height={80}
              className=""
              priority
            />
            <div>
              <h1 className="text-xl font-bold text-white">imgforge</h1>
              <p className="text-sm text-slate-400">
                OS Image Builder & Flasher
              </p>
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
