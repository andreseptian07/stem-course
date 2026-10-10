import test from 'node:test';
import assert from 'node:assert/strict';
import {createMariaDb} from '../db/mariadb.ts';
import {applyMariaDbMigrations} from '../db/mariadb-migrate.ts';
import {judgeReservationScenarios} from './judge-reservation-scenarios.mjs';
test('Judge0 concurrency and refunds use the real MariaDB adapter',{skip:process.env.MARIADB_INTEGRATION_TEST!=='true',timeout:20000},async()=>{
 assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_NAME,'stem_ci');
 const {pool,database}=createMariaDb();try{await applyMariaDbMigrations(pool);await judgeReservationScenarios(database);}finally{await pool.end();}
});
