/**
 * Read once, fail loudly. A missing SESSION_SECRET on a service published to the open
 * internet is not something to discover from a stack trace three requests in.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  /** Used to HMAC session ids at rest. At least 32 bytes of randomness. */
  sessionSecret: () => {
    const v = required("SESSION_SECRET");
    if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return v;
  },
  /**
   * The externally reachable origin, e.g. https://playbook.meerkat-cirius.ts.net.
   * Steam echoes return_to back to us and we compare it, so a wrong value here fails
   * the login rather than silently redirecting somewhere unexpected.
   */
  publicBaseUrl: () => required("PUBLIC_BASE_URL").replace(/\/+$/, ""),
  /** Optional: only used to fetch avatars and display names. */
  steamApiKey: () => process.env.STEAM_API_KEY || null,
  r2: () => ({
    bucket: required("R2_BUCKET"),
    endpoint: required("R2_ENDPOINT"),
    accessKeyId: required("AWS_ACCESS_KEY_ID"),
    secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
  }),
  isProduction: () => process.env.NODE_ENV === "production",
};
