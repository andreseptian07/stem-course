import test from 'node:test';
import {authorizationDatabase} from './authorization-fixture.mjs';
import {authorizationScenarios} from './authorization-scenarios.mjs';
test('authorization behavior, privacy and revocation barriers on disposable SQLite',async t=>{const {d,sql}=authorizationDatabase();try{await authorizationScenarios(t,d);}finally{sql.close();}});
