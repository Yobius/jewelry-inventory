import { SignJWT, jwtVerify } from 'jose'

export type JwtPayload = {
  sub: string
  role: string
}

const encoder = new TextEncoder()

export async function createJwt(payload: JwtPayload, secret: string): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encoder.encode(secret))
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret))
  if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { sub: payload.sub, role: payload.role }
}
