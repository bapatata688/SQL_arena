// ==============================================================================
// MASTER STAFF ENGINEER STUDY GUIDES (11 TOPICS)
// Contenido didáctico de alto nivel para SQL Arena
// Fuente base: build_curriculum.js (9 guías enriquecidas a profundidad Staff Engineer)
// + problems_advanced.js (2 temas HackerRank Advanced)
// ==============================================================================
import { topics } from './build_curriculum.js';
import { advancedTopics } from './problems_advanced.js';

export const masterTopics = [
  ...topics.filter(t => !advancedTopics.some(a => a.id === t.id)),
  ...advancedTopics
];
