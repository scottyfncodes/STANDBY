import type { Metadata, Viewport } from "next";
import { StoreProvider } from "@/components/store";
import { TabBar } from "@/components/TabBar";
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
  themeColor: "#f4f0e8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <div className="shell">{children}</div>
          <TabBar />
        </StoreProvider>
      </body>
    </html>
  );
}
