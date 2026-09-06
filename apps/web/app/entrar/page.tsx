import { Suspense } from "react";

import { FormularioEntrar } from "./formulario";
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
        <Suspense>
          <FormularioEntrar />
        </Suspense>
      </div>
    </main>
  );
}
