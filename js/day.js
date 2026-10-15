// Registro diário (dieta, água, passos, checklist, cardio avulso).
import { db } from './db.js';
import { dateKey } from './program.js';

export async function getDay(key = dateKey()) {
  return Object.assign({ id: key, protein: 0, kcal: 0, water: 0, steps: 0, checks: {}, log: [], cardio: [] }, await db.get('days', key));
}
export const saveDay = d => db.put('days', d);
