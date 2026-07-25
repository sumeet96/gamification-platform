import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Variable-Reward Demo — AI-Personalized Gamification",
  description:
    "Isolated within-subject test: fixed vs. variable reward schedule over course MCQs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
