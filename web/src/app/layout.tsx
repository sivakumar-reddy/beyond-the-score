import type { Metadata } from "next";
import { Space_Grotesk, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "./lib/store";
import Nav from "./components/Nav";
import CopilotDrawer from "./components/CopilotDrawer";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["400", "500", "600", "700"],
});
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-news",
  weight: ["400", "500", "600"],
});
const jetMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Beyond the Score — Credit Decision Intelligence",
  description:
    "A profit-optimized credit decision platform: policy optimization, scenario stress-testing, and governance on real LendingClub outcomes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${newsreader.variable} ${jetMono.variable}`}
      >
        <StoreProvider>
          <Nav />
          <main className="app-main">{children}</main>
          <CopilotDrawer />
        </StoreProvider>
      </body>
    </html>
  );
}
