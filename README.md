# Reloj de Torneo de Poker (PWA para TV y iPhone)

Reloj de torneo de poker listo para **GitHub Pages**, **iPhone / iPad (PWA instalable con modo offline)** y **TV / pantalla grande**.

## Características
- **30 niveles + 2 descansos** (`COMIDA` 60 min y `FIN DE RECOMPRAS` 10 min) y marcador `ACABA AQUÍ` en el Nivel 28.
- **Control de Entradas y Fichas**: `BUY-IN` (30,000), `REBUY` (30,000), `DOBLE REBUY` (65,000), `ADD-ON` (80,000) y `ADD-ON + DOBLE REBUY` (140,000) con cálculo en vivo de fichas totales, jugadores activos, stack promedio (en fichas y BB) y bolsa de premios opcional.
- **Alertas sonoras integradas** (aviso de 1 min, cuenta regresiva de 5 s, campana de cambio de nivel y anuncios opcionales por voz en español).
- **Instalable en iPhone como app (PWA)** y funciona **sin internet** gracias a su `Service Worker`.

## Publicar en GitHub Pages
1. Crea un repositorio nuevo en GitHub (por ejemplo `reloj-poker`).
2. Sube este proyecto desde la terminal:
   ```bash
   cd /Users/admin/.gemini/antigravity/scratch/poker-tournament-clock
   git remote add origin https://github.com/TU-USUARIO/reloj-poker.git
   git push -u origin main
   ```
3. En tu repositorio de GitHub entra a **Settings → Pages → Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)` → **Save**

En 1–2 minutos estará disponible en `https://TU-USUARIO.github.io/reloj-poker/`.

## Instalar en iPhone
1. Abre tu enlace de GitHub Pages en **Safari** en tu iPhone.
2. Toca el botón **Compartir** (cuadro con flecha hacia arriba).
3. Selecciona **Agregar a pantalla de inicio** → **Agregar**.
4. Ábrela desde el ícono dorado en tu pantalla de inicio: correrá en pantalla completa y funcionará incluso sin conexión.
