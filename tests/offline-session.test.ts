import test from "node:test";
import assert from "node:assert/strict";
import { readOfflineUser } from "../src/services/auth/offlineSession";
const user={id:"00000000-0000-4000-8000-00000000000a",email:"clinician@example.test"};
test("an expired persisted session identifies only its local offline workspace",async()=>{
 const cached=await readOfflineUser({getItem:key=>{assert.equal(key,"smilecompose.auth");return JSON.stringify({user,access_token:"expired.jwt",refresh_token:"saved",expires_at:1});}});
 assert.deepEqual(cached,user);
});
test("missing, invalid or signed-out session storage never assigns a workspace",async()=>{
 for(const value of [null,"bad","{}",JSON.stringify({user:{id:"not-an-account"},access_token:"x",refresh_token:"x"}),JSON.stringify({user})])assert.equal(await readOfflineUser({getItem:()=>value}),null);
});
test("secure-storage failures do not bypass sign in",async()=>{assert.equal(await readOfflineUser({getItem:async()=>{throw new Error("keychain unavailable");}}),null);});
