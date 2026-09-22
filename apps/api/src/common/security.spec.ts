import { createSecret, hashPassword, safeEqual, sha256, verifyPassword } from './security';

describe('security primitives', () => {
  it('hashes passwords with a unique Argon2id salt', async () => {
    const first = await hashPassword('ValidPassword123');
    const second = await hashPassword('ValidPassword123');
    expect(first).not.toEqual(second);
    expect(first).toContain('$argon2id$');
    await expect(verifyPassword(first, 'ValidPassword123')).resolves.toBe(true);
    await expect(verifyPassword(first, 'wrong')).resolves.toBe(false);
  });

  it('creates non-repeating opaque session secrets', () => {
    const first = createSecret(); const second = createSecret();
    expect(first).not.toEqual(second); expect(first.length).toBeGreaterThan(32);
    expect(safeEqual(sha256(first), sha256(first))).toBe(true);
    expect(safeEqual(sha256(first), sha256(second))).toBe(false);
  });
});
