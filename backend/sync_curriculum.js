import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { allProblems } from './problems_data.js';
import { masterTopics } from './master_guides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'curriculum');

// 1. problems.json: única fuente = problems_data.js
fs.writeFileSync(path.join(dir, 'problems.json'), JSON.stringify(allProblems, null, 2), 'utf-8');

// 2. topics.json: única fuente = master_guides.js (11 temas Staff Engineer)
const topicsPath = path.join(dir, 'topics.json');
fs.writeFileSync(topicsPath, JSON.stringify(masterTopics, null, 2), 'utf-8');

console.log(`[OK] ${allProblems.length} problems, ${masterTopics.length} master topics written to curriculum/`);
