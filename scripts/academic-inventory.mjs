import {createMariaDb} from '../db/mariadb.ts';
import {academicInventory} from '../lib/academic-migration.ts';
// Explicit environment only; this script has no mutation/migration mode.
const {pool,database}=createMariaDb();
try{console.log(JSON.stringify(await academicInventory(database),null,2));}finally{await pool.end();}
