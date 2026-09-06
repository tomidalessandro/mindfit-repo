import type { NextConfig } from "next";

const config: NextConfig = {
  // El repo tiene dos package-lock.json (la app vieja en la raíz y esta), así
  // que Turbopack no sabe cuál es la raíz del workspace. Se lo decimos, o
  // avisa en cada arranque.
  turbopack: { root: __dirname },
};

export default config;
