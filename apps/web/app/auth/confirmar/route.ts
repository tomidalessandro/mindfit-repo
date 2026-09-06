import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { clienteServidor } from "@/lib/supabase/servidor";

/** Solo rutas propias.
 *
 * Sin esto, un mail con ?volver=https://otro-sitio convertiría la app en un
 * trampolín: el usuario entra de verdad y aterriza en una página ajena que se
 * queda con la sesión. */
function destinoSeguro(pedido: string | null): string {
  return pedido && pedido.startsWith("/") && !pedido.startsWith("//") ? pedido : "/";
}

/** Donde aterriza el link mágico del mail.
 *
 * Supabase manda una de dos cosas según cómo esté armado el mail, y las dos
 * tienen que funcionar:
 *
 *   ?code=…        el flujo PKCE, que es el de la plantilla por defecto. Pide
 *                  un verificador guardado en una cookie, así que el link hay
 *                  que abrirlo en el mismo navegador que lo pidió.
 *   ?token_hash=…  el flujo del lado del servidor, que sale de una plantilla
 *                  con {{ .TokenHash }}. Este anda aunque el mail se abra en
 *                  otro dispositivo. */
export async function GET(pedido: NextRequest) {
  const q = pedido.nextUrl.searchParams;
  const volver = destinoSeguro(q.get("volver"));

  // Supabase también avisa por acá cuando el link venció o ya se usó.
  if (q.get("error")) {
    redirect(`/entrar?error=${encodeURIComponent(q.get("error_code") ?? "link-invalido")}`);
  }

  const supabase = await clienteServidor();
  const code = q.get("code");
  const token_hash = q.get("token_hash");
  const type = q.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) redirect("/entrar?error=otro-navegador");
    redirect(volver);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) redirect("/entrar?error=link-vencido");
    redirect(volver);
  }

  redirect("/entrar?error=link-invalido");
}
