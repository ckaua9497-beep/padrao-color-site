import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
