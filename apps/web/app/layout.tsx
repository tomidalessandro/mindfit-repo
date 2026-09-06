import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MindFit · Rutinas",
  description: "Rutinas de entrenamiento de la fuerza · Power in Balance",
};

export const viewport: Viewport = {
  themeColor: "#0C0D10",
  // Se usa en el gimnasio, con una mano. Que no haga zoom solo al tocar un
  // campo de peso, pero que se pueda agrandar si alguien lo necesita.
  initialScale: 1,
  width: "device-width",
  maximumScale: 5,
};

const RECORDAR_TEMA = `
  try {
    if (localStorage.getItem("mf:tema") === "claro")
      document.documentElement.setAttribute("data-tema", "claro");
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" data-tema="oscuro">
      <head>
        {/* Antes de pintar, para que el tema claro no aparezca después de un
            fogonazo oscuro. Es la misma técnica que usa la v2. */}
        <script dangerouslySetInnerHTML={{ __html: RECORDAR_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
