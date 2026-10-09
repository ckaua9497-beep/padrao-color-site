import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev aberto pelo IP da rede (celular, outro computador) ou por um Quick Tunnel do cloudflared (link
  // *.trycloudflare.com para mostrar o teste): sem isto o Next 16 bloqueia o HMR e os recursos de dev.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.trycloudflare.com"],
  // Painel da multiloja: logo (até 2 MB) e banner (até 5 MB) vão por Server Action, num envio de até 8 MB.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.padraocolor.com.br",
        pathname: "/padraocolor/imagens/**",
      },
    ],
  },
};

export default nextConfig;
