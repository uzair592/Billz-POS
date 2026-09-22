import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';

export const hashPassword = (value: string) => argon2.hash(value, { type: argon2.argon2id });
export const verifyPassword = (hash: string, value: string) => argon2.verify(hash, value);
export const createSecret = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
