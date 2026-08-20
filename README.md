# Money

Aplicación web de finanzas personales de uso privado, inspirada en `sumant.app`. El usuario registra a mano lo que gasta y lo que ingresa, y la aplicación se lo devuelve entendible: cuánto tiene, cuánto entró, cuánto salió, cuánto ahorró.

---

## 1. Requisitos previos

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **PostgreSQL**: `>= 15.0`

---

## 2. Puesta en marcha

Desde un clonado limpio, ejecutar un único comando para instalar dependencias y preparar el entorno (**RNF-MA-06**):

```bash
# 1. Configuración inicial (instala dependencias, prepara el entorno)
npm run setup

# 2. Iniciar el servidor de desarrollo
npm run dev
```

La aplicación quedará disponible en [http://localhost:3000](http://localhost:3000).

---

## 3. Scripts disponibles

- `npm run setup`: Instalación y configuración inicial desde un clonado limpio.
- `npm run dev`: Inicia el servidor de desarrollo de Next.js en modo local.
- `npm run build`: Compila y genera el paquete de producción.
- `npm run start`: Inicia el servidor compilado de producción.
- `npm run typecheck`: Comprobación estricta de tipos TypeScript sin emitir código.

---

## 4. Estructura del proyecto

El repositorio sigue una arquitectura modular estricta dividida en cuatro carpetas principales:

```text
app/          # Rutas: (public), (app) y api/
components/   # Componentes transversales: ui/, layout/, money/, feedback/
features/     # Módulos por área de negocio: auth/, dashboard/, transactions/, budgets/, etc.
lib/          # Dominio (money, balances), repositorios con scope de usuario, db, schemas, auth, format
messages/     # Diccionarios de internacionalización (es.json, en.json)
scripts/      # Herramientas operativas y verificación
```

Sin carpetas `src/`, `types/` ni `utils/`.
