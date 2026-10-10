import test from 'node:test';
import assert from 'node:assert/strict';
import {createMariaDb} from '../db/mariadb.ts';
import {applyMariaDbMigrations} from '../db/mariadb-migrate.ts';
import {migrationScenarios} from './authorization-migration-scenarios.mjs';
test('authorization backfill source freshness and rollback on isolated MariaDB',{skip:process.env.MARIADB_INTEGRATION_TEST!=='true'},async t=>{
 assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_NAME,'stem_ci');
 const root=createMariaDb();try{await root.pool.query('CREATE DATABASE stem_authorization_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');}finally{await root.pool.end();}
 const {pool,database:d}=createMariaDb({...process.env,DB_NAME:'stem_authorization_ci'});
 try{await applyMariaDbMigrations(pool);await migrationScenarios(t,d);}finally{await pool.end();}
});
