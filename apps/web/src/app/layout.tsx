import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ContentForge",
    template: "%s | ContentForge",
  },
  description: "Turn 1 hour of recording into 30 days of content.",
  openGraph: {
    title: "ContentForge",
    description: "Turn 1 hour of recording into 30 days of content.",
    siteName: "ContentForge",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <TRPCProvider>
            {children}
            <Toaster />
          </TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
