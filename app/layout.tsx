import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LinkedIn AI Agent",
  description:
    "An AI agent that finds trending tech news daily, writes a LinkedIn post, and publishes it after one-tap approval on Telegram.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
