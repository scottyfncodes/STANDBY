import type { Metadata, Viewport } from "next";
import { StoreProvider } from "@/components/store";
import { TabBar } from "@/components/TabBar";
import { THEME_SCRIPT } from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "STANDBY — a smarter way to travel standby", template: "%s · STANDBY" },
  description: "Turn flexible airline travel privileges into trips worth taking — with a realistic plan for getting there and getting home.",
  applicationName: "STANDBY",
  appleWebApp: { capable: true, title: "STANDBY", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // theme-color is set by THEME_SCRIPT so it follows the Appearance setting.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme and color-scheme are set by THEME_SCRIPT before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <StoreProvider>
          <div className="shell">{children}</div>
          <TabBar />
        </StoreProvider>
      </body>
    </html>
  );
}
