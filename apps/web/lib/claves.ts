import "server-only";

/** Las contraseñas que el coach le pasa a sus alumnos.
 *
 * Mismo criterio que el worker: tres palabras y dos dígitos, porque hay que
 * dictarlas por WhatsApp y volver a tipearlas en un celular. Son unas 10^8
 * combinaciones — alcanza para un grupo cerrado con el límite de intentos de
 * Supabase enfrente, y no para una app abierta al público. Cuando haya
 * recuperación por mail, esto lo reemplaza lo que elija cada uno.
 *
 * `server-only` no es decorativo: si este módulo terminara en el bundle del
 * cliente, la generación de contraseñas quedaría a la vista.
 */

// Palabras cortas, sin acentos, fáciles de dictar por teléfono.
const PALABRAS = `
banco barra pesa disco cinta salto pausa fuerza envion press remo sentadilla
puente plancha camilla polea banda goma soga cono step bosu kettle mancuerna
lunes martes jueves viernes sabado enero marzo abril junio julio agosto
tigre puma lobo halcon ciervo bisonte oso lince zorro condor jaguar aguila
rojo verde azul negro blanco gris dorado plata bronce cobre
norte sur este oeste cumbre valle rio lago monte campo bosque duna
firme sereno rapido lento suave duro largo corto alto bajo ligero pesado
uno dos tres cuatro cinco seis siete ocho nueve diez
`.trim().split(/\s+/);

/** Un entero aleatorio en [0, tope) sin sesgo.
 *
 * `Math.random()` no sirve acá: es predecible y no está pensado para esto.
 * El descarte evita el sesgo del módulo, que con 100 palabras y 2^32 valores
 * sería mínimo, pero escribirlo bien cuesta tres líneas. */
function alAzar(tope: number): number {
  const limite = Math.floor(0xffffffff / tope) * tope;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return n % tope;
}

export function claveNueva(): string {
  const palabras = Array.from({ length: 3 }, () => PALABRAS[alAzar(PALABRAS.length)]);
  return `${palabras.join("-")}-${10 + alAzar(90)}`;
}

/** "María José" → "mariajose". Sin acentos ni espacios: es la parte local de
 *  un mail y tiene que sobrevivir a que la escriban a mano. */
export function slug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** El dominio interno: no existe y nunca va a existir.
 *
 * Deja claro de un vistazo que esa dirección no recibe mails, en vez de
 * aparentar una casilla real. Cuando haya dominio propio y SMTP, los alumnos
 * pasan a darse de alta con su mail de verdad. */
export const DOMINIO_INTERNO = "mindfit.local";
