import type { User } from "@supabase/supabase-js";
import { isNativeApp } from "@/native/platform";
import { keychainSessionStorage } from "@/native/secureStorage";

/** A local workspace hint only. It never grants server access or replaces JWT verification.
 * Supabase cannot return an expired session when token refresh is unavailable offline. */
export async function readOfflineUser(storage?:{getItem(key:string):string|null|Promise<string|null>}):Promise<User|null>{
 try {
  const source=storage??(isNativeApp()?keychainSessionStorage():typeof localStorage!=="undefined"?localStorage:null);
  if(!source)return null;
  const session=JSON.parse(await source.getItem("smilecompose.auth")??"null");
  if(!session||typeof session.access_token!=="string"||typeof session.refresh_token!=="string"||!session.user||typeof session.user.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id))return null;
  return session.user as User;
 }catch{return null;}
}
