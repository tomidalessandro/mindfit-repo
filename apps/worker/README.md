# MindFit · worker

Los trabajos que no van en el camino de los datos: migración del esquema viejo,
backups, informes. La app **no** habla con esto — habla directo con Supabase.

```bash
cd apps/worker
uv sync --extra dev
uv run pytest                       # las pruebas de conversión, sin base
uv run python -m mindfit_worker.migrar --help
```

## La migración, en dos pasos separados a propósito

1. **`convertir.py`** — funciones puras. Toman el volcado de `mindfit_store`
   y devuelven filas. No tocan la red ni la base, así que se prueban enteras
   con `pytest` y se pueden correr mil veces mientras se ajustan.
2. **`migrar.py`** — la capa fina que escribe esas filas en Postgres.

Esa separación es a propósito: lo que se va a equivocar es la conversión, no
el `insert`.
