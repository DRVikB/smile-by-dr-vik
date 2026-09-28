import { registerPlugin } from "@capacitor/core";
import { AuthMessage } from "@/services/auth/authService";

interface AppleCredentialResult {
  cancelled: boolean;
  identityToken?: string;
  authorizationCode?: string;
  givenName?: string;
  familyName?: string;
}

/** Local plugin: ios/App/App/AppleSignInPlugin.swift. */
const SmileAppleSignIn = registerPlugin<{ authorize(options: { nonce?: string }): Promise<AppleCredentialResult> }>("SmileAppleSignIn");

export interface AppleCredential {
  identityToken: string;
  authorizationCode: string;
  givenName: string;
  familyName: string;
}

/** Apple's native sign-in sheet. Null when the user cancels. */
export async function requestAppleCredential(hashedNonce?: string): Promise<AppleCredential | null> {
  let result: AppleCredentialResult;
  try {
    result = await SmileAppleSignIn.authorize({ nonce: hashedNonce });
  } catch (error) {
    throw new AuthMessage("Sign in with Apple didn’t complete. Please try again.", "apple_failed", { cause: error });
  }
  if (result.cancelled || !result.identityToken) return null;
  return {
    identityToken: result.identityToken,
    authorizationCode: result.authorizationCode ?? "",
    givenName: result.givenName ?? "",
    familyName: result.familyName ?? "",
  };
}
