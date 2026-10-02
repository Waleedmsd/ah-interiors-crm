import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {database,closeDatabase} from '../server/db';
await migrate(database(),{migrationsFolder:'./drizzle'});
console.log('Database migrations applied.');
await closeDatabase();
