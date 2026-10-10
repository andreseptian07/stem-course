import test from 'node:test';
import {authorizationDatabase} from './authorization-fixture.mjs';
import {curriculumInvitationScenarios} from './curriculum-invitation-scenarios.mjs';
import {selectCurriculumItem} from '../lib/curriculum-state.ts';
import assert from 'node:assert/strict';
test('T3 curriculum invitations on a disposable database',async t=>{const f=authorizationDatabase();try{await curriculumInvitationScenarios(t,f.d);}finally{f.sql.close();}});
test('T3-08: explicit unknown or revoked course selection never falls back to another assignment',()=>{const items=[{course:{id:'a'}},{course:{id:'b'}}];assert.equal(selectCurriculumItem(items,null),items[0]);assert.equal(selectCurriculumItem(items,'b'),items[1]);for(const id of ['','forbidden','../owner'])assert.equal(selectCurriculumItem(items,id),null);assert.equal(selectCurriculumItem([],null),null);});
