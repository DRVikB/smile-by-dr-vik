import { z } from "zod";

// Strict web/native CSP forbids JavaScript compilation. Avoid even Zod's
// caught Function() capability probe; interpreted validation remains identical.
z.config({ jitless: true });
export { z };
