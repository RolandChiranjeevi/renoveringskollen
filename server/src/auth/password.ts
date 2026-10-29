import { hash, verify } from '@node-rs/argon2';

// argon2id med bibliotekets standardparametrar (m=19 MiB, t=2, p=1) – OWASP:s rekommenderade miniminivå.

export const hashPassword = (password: string) => hash(password);

// Används när e-postadressen inte finns, så att svarstiden inte avslöjar vilka konton som existerar.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(
  storedHash: string | undefined,
  password: string,
): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hash('ingen-användare-med-den-adressen');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(storedHash, password).catch(() => false);
}
