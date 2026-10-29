import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { getViewAsState } from "@/lib/data";
import { ViewAsBanner, ViewAsProvider } from "@/components/view-as";

export const metadata: Metadata = {
  title: "Colnix",
  description: "Naro\u010dila, dostava in ra\u010duni",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Colnix", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#7a1230",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewAs = await getViewAsState();
  return (
    <html lang="sl">
      <body>
        <ViewAsProvider state={viewAs}>
          <ViewAsBanner />
          {children}
        </ViewAsProvider>
        <Toaster
          position="bottom-center"
          offset={80}
          toastOptions={{
            style: {
              background: "#231a1c",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
            },
          }}
        />
      </body>
    </html>
  );
}
