import test from 'node:test';
import {authorizationDatabase} from './authorization-fixture.mjs';
import {migrationScenarios} from './authorization-migration-scenarios.mjs';
test('authorization migration rollback, source freshness and forward recovery on disposable SQLite',async t=>{const {d,sql}=authorizationDatabase();try{await migrationScenarios(t,d);}finally{sql.close();}});
