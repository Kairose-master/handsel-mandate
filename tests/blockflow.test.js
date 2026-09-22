import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {assertWorkflowBinding,compileMandateWorkflow} from '../runtime/blockflow.js';

const root=process.env.BLOCKFLOW_ROOT||path.resolve('../BlockFlow');
const mandate={id:'fixture',network:'eip155:84532',asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',endpoint:'https://seller.example/paid',payTo:'0x1111111111111111111111111111111111111111',total:10000,perCall:1000,expiresAt:2000000000000,aaAddress:'0x2222222222222222222222222222222222222222'};

test('real BlockFlow compiler validates and binds the mandate workflow',{skip:!process.env.BLOCKFLOW_ROOT&&!fs.existsSync(path.join(root,'package.json'))},()=>{
  mandate.workflow=compileMandateWorkflow({blockflowRoot:root},mandate);
  assert.equal(mandate.workflow.processId,'HandselMandatePayment');
  assert.equal(assertWorkflowBinding(mandate),true);
  mandate.perCall++;
  assert.throws(()=>assertWorkflowBinding(mandate),/no longer matches/);
});
