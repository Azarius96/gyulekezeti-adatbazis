import jwt from "jsonwebtoken";

const DEV_DEFAULT = "dev-secret-change-in-production";
const SECRET = process.env.JWT_SECRET ?? DEV_DEFAULT;

if (process.env.NODE_ENV === "production" && (SECRET === DEV_DEFAULT || SECRET.length < 32)) {
  throw new Error(
    "JWT_SECRET hiányzik vagy túl gyenge production módban. Állítson be egy legalább 32 karakteres, véletlenszerű titkot (pl. `openssl rand -hex 32`)."
  );
}

export interface AuthTokenPayload {
  userId: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}
