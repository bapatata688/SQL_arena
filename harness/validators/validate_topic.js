import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOPICS_PATH = path.join(__dirname, '..', '..', 'backend', 'curriculum', 'topics.json');

const REQUIRED_SECTIONS = [
  { id: 1, pattern: /##\s*1\.\s*Fundamentos\s+Teóricos/i, name: "1. Fundamentos Teóricos y Procesamiento Lógico" },
  { id: 2, pattern: /##\s*2\.\s*Modelos\s+Mentales\s+Visuales/i, name: "2. Modelos Mentales Visuales (ASCII)" },
  { id: 3, pattern: /##\s*3\.\s*Comportamiento\s+Interno/i, name: "3. Comportamiento Interno en InnoDB / Motor" },
  { id: 4, pattern: /##\s*4\.\s*Patrones\s+de\s+Producción/i, name: "4. Patrones de Producción y Modismos Canónicos" },
  { id: 5, pattern: /##\s*5\.\s*Antipatrones\s+Reales/i, name: "5. Antipatrones Reales de Producción" },
  { id: 6, pattern: /##\s*6\.\s*Heurísticas\s+Avanzadas/i, name: "6. Heurísticas Avanzadas para Entrevistas / Producción" }
];

export function validateTopics() {
  if (!fs.existsSync(TOPICS_PATH)) {
    console.error(`Error: topics.json no encontrado en: ${TOPICS_PATH}`);
    return { success: false, errors: [`Archivo no encontrado: ${TOPICS_PATH}`] };
  }

  const rawData = fs.readFileSync(TOPICS_PATH, 'utf-8');
  let topics;
  try {
    topics = JSON.parse(rawData);
  } catch (err) {
    console.error('Error parseando JSON de topics:', err.message);
    return { success: false, errors: [err.message] };
  }

  console.log(`\n======================================================`);
  console.log(`VALIDANDO GUÍAS TEÓRICAS STAFF DATA ENGINEER (${topics.length} temas)`);
  console.log(`======================================================\n`);

  let passedCount = 0;
  let totalErrors = 0;
  const reports = [];

  for (const topic of topics) {
    const topicErrors = [];
    const topicWarnings = [];

    if (!topic.id || !topic.title) {
      topicErrors.push('Falta `id` o `title`');
    }

    if (!topic.guide || typeof topic.guide !== 'string' || topic.guide.trim().length < 200) {
      topicErrors.push('La guía (`guide`) está vacía o es demasiado corta (< 200 caracteres)');
    } else {
      // Validar las 6 secciones obligatorias
      for (const section of REQUIRED_SECTIONS) {
        if (!section.pattern.test(topic.guide)) {
          topicErrors.push(`Falta la sección obligatoria: "${section.name}"`);
        }
      }

      // Validar presencia de diagramas ASCII (código en ```text o cajas de texto)
      const hasAsciiDiagram = /```text[\s\S]*?```/i.test(topic.guide) || /[┌│─┼└]/.test(topic.guide);
      if (!hasAsciiDiagram) {
        topicWarnings.push('Recomendado: Añadir al menos un diagrama visual ASCII en bloque ```text');
      }

      // Validar presencia de código SQL
      const hasSqlCode = /```sql[\s\S]*?```/i.test(topic.guide);
      if (!hasSqlCode) {
        topicErrors.push('No contiene bloques de código SQL (```sql)');
      }
    }

    const isSuccess = topicErrors.length === 0;
    if (isSuccess) {
      passedCount++;
      console.log(`[PASS] ${topic.id.padEnd(16)}: "${topic.title}" (${(topic.guide || '').length} chars)`);
      if (topicWarnings.length > 0) {
        topicWarnings.forEach(w => console.log(`    Aviso: ${w}`));
      }
    } else {
      totalErrors += topicErrors.length;
      console.log(`[FAIL] ${topic.id.padEnd(16)}: "${topic.title}"`);
      topicErrors.forEach(e => console.log(`   - Error: ${e}`));
    }

    reports.push({ id: topic.id, title: topic.title, isSuccess, topicErrors, topicWarnings });
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`Resumen Guías Teóricas: ${passedCount}/${topics.length} APROBADAS (${totalErrors} errores)`);
  console.log(`------------------------------------------------------\n`);

  return { success: totalErrors === 0, passedCount, totalCount: topics.length, reports };
}

// Si se ejecuta directamente desde CLI
if (process.argv[1] && process.argv[1].endsWith('validate_topic.js')) {
  const result = validateTopics();
  process.exit(result.success ? 0 : 1);
}

