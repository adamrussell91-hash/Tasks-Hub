import { ProgramSchema, type Program } from '@/schemas/program';
import catalog from '../../fixtures/competitions.json';

export function catalogPrograms(): Program[] {
  return (catalog as Program[]).map((item) => ProgramSchema.parse(item));
}
