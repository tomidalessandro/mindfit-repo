/** El texto de "¿Cómo progresar?".
 *
 * Es el método de MindFit escrito por el coach, no relleno: explica la doble
 * progresión, que es lo que hace que la app tenga sentido. Portado tal cual
 * del index.html de la v2 — si cambia, lo cambia Tomás, no el que toque el
 * código.
 */

export const GUIA = {
  rotulo: "Doble progresión · MindFit",
  titulo: "¿Cómo progresar?",
  intro:
    "Cómo elegir el peso y cómo ir subiendo, semana a semana. Ejemplo con 3 series de 6 a 8 repeticiones.",

  pasos: [
    "Elegí un peso con el que puedas completar 3 series de 6 repeticiones sin llegar al fallo en ninguna serie.",
    "Cada semana sumá una repetición en las tres series: 6.6.6 → 7.7.7 → 8.8.8. Evitá el fallo (podés quedar cerca, pero no fallar) o comprometerás las repeticiones siguientes.",
    "Al llegar al objetivo (3x8 en este ejemplo) en la semana 3, la semana 4 aumentá la carga y volvé a empezar el ciclo con 3x6.",
  ],

  ejemplo: [
    { semana: "Semana 1", carga: "35 kg", reps: "6.6.6" },
    { semana: "Semana 2", carga: "35 kg", reps: "7.7.7" },
    { semana: "Semana 3", carga: "35 kg", reps: "8.8.8" },
    { semana: "Semana 4", carga: "40 kg", reps: "6.6.6" },
  ],

  cierre: [
    {
      t: "La técnica manda",
      d: "Si para mover el peso tenés que romper la técnica, ese peso todavía no es tuyo.",
    },
    {
      t: "Respetá las pausas",
      d: "En fuerza, los 2 a 3 minutos entre series no son tiempo perdido: son lo que te permite levantar bien la serie siguiente.",
    },
    {
      t: "Anotá siempre",
      d: "Cargá el peso de cada ejercicio el mismo día que entrenás. Es lo que deja ver tu evolución y ajustar la rutina.",
    },
  ],
} as const;
