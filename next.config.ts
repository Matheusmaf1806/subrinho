import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bcryptjs"],
  experimental: {
    serverActions: {
      // comprovantes de repasse (PDF/imagem) são enviados via Server Actions
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
