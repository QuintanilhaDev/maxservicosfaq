import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// jose funciona tanto no runtime Node (Route Handlers) quanto no Edge Runtime
// (middleware.ts), diferente do pacote "jsonwebtoken", que não roda no Edge.
const JWT_SECRET = process.env.JWT_SECRET || "";
const encodedSecret = new TextEncoder().encode(
  JWT_SECRET || "dev-only-insecure-secret-troque-isso"
);

export const SESSION_COOKIE_NAME = "max_admin_session";

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "[max-servicos] JWT_SECRET não está definido. Configure essa variável de ambiente antes de usar o login."
  );
}

export interface SessionPayload {
  sub: string; // id do admin
  username: string;
  isMaster: boolean;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(encodedSecret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      isMaster: payload.isMaster as boolean,
    };
  } catch {
    return null;
  }
}

/**
 * Lê a sessão do admin logado a partir do cookie httpOnly.
 * Use apenas em Server Components / Route Handlers.
 */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
