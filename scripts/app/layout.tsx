import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAX Serviços | Central de Dúvidas",
  description: "Envie sua dúvida para a equipe da MAX Serviços e receba a resposta direto no seu WhatsApp.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080a09",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-max-black text-gray-200 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
