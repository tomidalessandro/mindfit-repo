"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./tipos";

/** El cliente que usan los componentes del navegador.
 *
 * Lleva la publishable key, que viaja al cliente a la vista de todos. No es un
 * secreto: sin sesión no abre una sola fila, y con sesión Postgres decide qué
 * puede ver cada uno. Eso es lo que arreglan las políticas RLS, y está
 * verificado — sin JWT la API devuelve 401 en las cinco tablas. */
export function clienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
