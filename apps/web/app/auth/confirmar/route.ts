import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { clienteServidor } from "@/lib/supabase/servidor";

/** Donde aterriza el link mágico del mail.
 *
 * Supabase manda un `token_hash` de un solo uso; acá se canjea por una sesión
 * y se guarda en cookies. El token viaja en la URL, así que nunca se
 * redirige a un destino que venga de afuera sin revisarlo. */
export async function GET(pedido: NextRequest) {
  const parametros = pedido.nextUrl.searchParams;
  const token_hash = parametros.get("token_hash");
  const type = parametros.get("type") as EmailOtpType | null;

  // Solo rutas propias: sin esto, un mail con ?volver=https://otro-sitio
  // convertiría la app en un trampolín para robar sesiones.
  const pedido_volver = parametros.get("volver") ?? "/";
  const volver =
    pedido_volver.startsWith("/") && !pedido_volver.startsWith("//")
      ? pedido_volver
      : "/";

  if (!token_hash || !type) {
    redirect("/entrar?error=link-invalido");
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    redirect("/entrar?error=link-vencido");
  }

  redirect(volver);
}
