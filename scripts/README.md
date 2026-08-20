# Money — Scripts de Base de Datos y Verificación

Este directorio contiene scripts operativos y de verificación técnica del esquema de base de datos.

---

## 1. Verificación del DDL (`scripts/verify-ddl.sql`)

Prueba de regresión que valida de punta a punta:
1. Creación limpia de las 13 tablas, índices, restricciones y disparadores en un esquema aislado (`verify_ddl`).
2. Compatibilidad de columnas generadas, incluyendo `budgets.category_kind GENERATED ALWAYS AS ('expense') STORED`.
3. Siembra integral de un usuario completo (cuentas en CLP y USD, categorías, regla recurrente, transacciones con y sin recurrencia, transferencias entre monedas, presupuesto, meta y aportación).
4. Eliminación de cuenta con `DELETE FROM users` y verificación de borrado en cascada sin filas huérfanas.
5. Preservación del registro de invitación canjeada con `redeemed_by = NULL` (**CR-01**, **CR-02**).
6. Cierre con `ROLLBACK` para garantizar idempotencia e inocuidad en entornos CI/locales.

---

## 2. Instrucciones de ejecución

### Opción A: Con Docker (PostgreSQL 15)

```bash
# 1. Iniciar contenedor efímero de PostgreSQL 15
docker run --name pg15-verify -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15-alpine

# 2. Esperar a que el motor esté listo para conexiones
docker exec -i pg15-verify pg_isready -U postgres

# 3. Ejecutar la verificación completa del DDL
docker exec -i pg15-verify psql -U postgres -d postgres < scripts/verify-ddl.sql

# 4. Detener y remover el contenedor
docker rm -f pg15-verify
```

---

### Opción B: Con `psql` directo (cliente/servidor local o remoto)

```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -f scripts/verify-ddl.sql
```

---

## 3. Salida esperada

El script debe finalizar con código de salida `0` y mostrar los siguientes avisos:

```text
NOTICE:  CONFIRMED: PostgreSQL 15 successfully generated budgets.category_kind = "expense"
NOTICE:  CONFIRMED: All tables verified. User 018d0000-0000-7000-8000-000000000001 was completely deleted with all cascading child records, and invitation was preserved with redeemed_by=NULL.
ROLLBACK
```
