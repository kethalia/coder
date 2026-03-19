import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Hive Orchestrator",
  description: "AI-powered task orchestration platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
            <Link href="/tasks" className="text-lg font-bold tracking-tight text-white">
              Hive
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/tasks"
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                Tasks
              </Link>
              <Link
                href="/tasks/new"
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                New Task
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
