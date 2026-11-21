import { runMigrationCheck } from './migration-check';

await runMigrationCheck(process.argv.slice(2));
