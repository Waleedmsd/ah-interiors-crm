import {runJobs} from '../server/jobs';
import {closeDatabase} from '../server/db';
console.log(await runJobs());await closeDatabase();
