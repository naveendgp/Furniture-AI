import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FurnitureAI — Room Visualizer",
  description: "AI-powered furniture room visualization. Upload a room photo, add furniture, and preview how it looks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-[#09090b] text-white selection:bg-blue-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-[#09090b] to-[#09090b] -z-10" />
        {children}
      </body>
    </html>
  );
}
