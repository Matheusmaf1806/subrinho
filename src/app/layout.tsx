import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Subrinho · Seu sobrinho favorito da tecnologia", template: "%s · Subrinho" },
  description: "Plataforma de viagens Subrinho: lojas personalizadas para agências, com ingressos, hospedagem, casas, seguro viagem e chip.",
};

export const viewport: Viewport = { themeColor: "#E4113F" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
