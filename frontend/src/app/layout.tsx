import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkWrapper } from "@/components/ClerkWrapper";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CivicBridge",
  description:
    "Report a civic issue with a photograph. CivicBridge classifies the waste, scores its urgency and routes it to the responsible municipal authority.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(geistSans.variable, geistMono.variable, "font-sans")}
    >
      <body>
        <ClerkWrapper>{children}</ClerkWrapper>
      </body>
    </html>
  );
}
