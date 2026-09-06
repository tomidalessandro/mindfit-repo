import { Suspense } from "react";

import { FormularioEntrar } from "./formulario";
import { RescatarFragmento } from "./rescatar-fragmento";
import estilos from "./entrar.module.css";

export default function Entrar() {
  return (
    <main className={estilos.pantalla}>
      <div className={estilos.caja}>
        <h1 className={estilos.titulo}>MindFit</h1>
        <p className={estilos.bajada}>
          Poné tu mail y te mandamos un link para entrar. Sin contraseña que
          recordar.
        </p>
        {/* Antes que el formulario: si el link mágico dejó la sesión en el
            fragmento de la URL, esto la rescata y ni se ve esta pantalla. */}
        <RescatarFragmento />
        <Suspense>
          <FormularioEntrar />
        </Suspense>
      </div>
    </main>
  );
}
