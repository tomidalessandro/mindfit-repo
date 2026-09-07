import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

/** El link de acceso directo: mindfit.app/e/<codigo>
 *
 * Existe para que los alumnos puedan probar la app mientras el envío de mails
 * no esté resuelto. El código identifica a una persona, y esta ruta lo canjea
 * por una sesión de verdad de Supabase Auth.
 *
 * Lo importante: NO saltea la seguridad, cambia cómo se prueba la identidad.
 * De acá en adelante el usuario tiene su JWT y RLS decide qué ve, igual que
 * si hubiera entrado por mail. Sacar la autenticación de raíz no serviría:
 * las políticas filtran por auth.uid(), así que sin sesión Postgres devuelve
 * cero filas y la app se vería vacía.
 *
 * La clave secreta se usa solo acá, del lado del servidor, y nunca se manda
 * al navegador.
 */
export async function GET(
  _pedido: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;

  // Sin la clave del servidor esto no puede funcionar, y es preferible un
  // error claro a una pantalla de login que nadie entiende por qué aparece.
  if (!url || !secreta) {
    redirect("/entrar?error=acceso-directo-sin-configurar");
  }
  if (!codigo || codigo.length < 16) {
    redirect("/entrar?error=link-invalido");
  }

  const cabeceras = {
    apikey: secreta,
    Authorization: `Bearer ${secreta}`,
    "Content-Type": "application/json",
  };

  // ¿De quién es este código? La consulta va con la clave secreta porque
  // `codigo_acceso` no es legible para nadie más — ni siquiera para su dueño.
  const r = await fetch(
    `${url}/rest/v1/perfiles?select=id&codigo_acceso=eq.${encodeURIComponent(codigo)}`,
    { headers: cabeceras, cache: "no-store" },
  );
  const perfiles: { id: string }[] = r.ok ? await r.json() : [];
  if (perfiles.length !== 1) {
    redirect("/entrar?error=link-invalido");
  }

  // El mail no sale de la app: `generate_link` devuelve el link ya armado sin
  // mandar nada. Por eso esto no toca el límite de mails por hora.
  const usuario = await fetch(`${url}/auth/v1/admin/users/${perfiles[0].id}`, {
    headers: cabeceras,
    cache: "no-store",
  });
  if (!usuario.ok) {
    redirect("/entrar?error=link-invalido");
  }
  const { email } = (await usuario.json()) as { email: string };

  const enlace = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ type: "magiclink", email }),
    cache: "no-store",
  });
  if (!enlace.ok) {
    redirect("/entrar?error=link-invalido");
  }
  const { action_link } = (await enlace.json()) as { action_link: string };

  // Sale del dominio propio: Supabase verifica el token y devuelve la sesión.
  redirect(action_link);
}
