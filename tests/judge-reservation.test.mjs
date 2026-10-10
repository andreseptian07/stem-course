import test from 'node:test';
import {authorizationDatabase} from './authorization-fixture.mjs';
import {judgeReservationScenarios} from './judge-reservation-scenarios.mjs';
test('concurrent coding replay and configuration changes preserve quotas and private tests',{timeout:15000},async()=>{
 const {d,sql}=authorizationDatabase();try{await judgeReservationScenarios(d);}finally{sql.close();}
});
