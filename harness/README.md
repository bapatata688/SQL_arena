# SQL Arena Engineering Harness & Curriculum SSoT

Este directorio constituye la **Única Fuente de Verdad (Single Source of Truth - SSoT)** y el arnés de ingeniería (*Harness*) para la creación, validación estática y verificación dinámica de contenido educativo (guías teóricas Staff Data Engineer) y ejercicios prácticos estilo LeetCode / HackerRank en **SQL Arena**.

---

## 📁 Arquitectura del Harness

```text
apps/sql-arena/harness/
├── README.md                           # Documentación maestra y manual de procedimientos (SSoT)
├── cli.js                              # Interfaz de línea de comandos para validaciones
├── templates/
│   ├── topic_guide_template.md         # Plantilla canónica de 6 secciones para guías teóricas
│   └── problem_template.js             # Esquema formal JavaScript para nuevos ejercicios
└── validators/
    ├── validate_topic.js               # Linter estático de guías teóricas (estructura y diagramas)
    └── validate_problem.js             # Verificador dinámico contra MySQL 8 Sandbox
```

---

## 🛠️ Herramientas de Línea de Comandos (CLI)

Desde la terminal en `apps/sql-arena`:

### 1. Validar la estructura y calidad de todas las guías teóricas:
```bash
node harness/cli.js lint-topics
```
- Verifica que cada guía en `curriculum/topics.json` cumpla con las 6 secciones obligatorias.
- Detecta bloques de diagramas ASCII y formatea advertencias de completitud.

### 2. Validar y ejecutar dinámicamente un problema específico:
```bash
node harness/cli.js test-problem rounding-1
```
- Conecta a MySQL 8 (`sql_arena_sandbox`).
- Ejecuta `schemaDDL` y `seedDML`.
- Ejecuta `solutionSQL` y valida columnas esperadas, tipos de datos y tiempo de respuesta.

### 3. Ejecutar la suite completa de calidad (Guías + Problemas):
```bash
node harness/cli.js validate-all
```

---

## 📖 Estándares del Currículum (Resumen Operativo)

1. **Guías Teóricas:**
   - Todo módulo debe responder a la pregunta: *¿Cómo opera esto en las entrañas de InnoDB y el optimizador CBO?*
   - Obligatorio incluir diagramas ASCII para modelado de datos y memoria.
   - Prohibido código o explicaciones superficiales sin justificación de costos $O(N)$.

2. **Ejercicios Prácticos:**
   - Todo ejercicio debe someter al alumno a trampas de datos reales: nulos en subqueries, empates en rankings, claves foráneas inexistentes, y divisiones por cero.
   - La solución de referencia debe ser la forma canónica óptima recomendada en entrevistas FAANG / HackerRank.

