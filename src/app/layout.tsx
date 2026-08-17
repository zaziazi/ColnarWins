import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vinarna",
  description: "Naro\u010dila, dostava in ra\u010duni",
};

export const viewport: Viewport = {
  themeColor: "#7a1230",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sl">
      <body>
        {children}
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
