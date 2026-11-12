import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SCRYPT_MAX_MEM = 64 * 1024 * 1024;
const PREFIX = 'scrypt';

function toBuffer(value) {
  return Buffer.from(String(value || ''), 'base64');
}

export function hashPassword(password) {
  const plain = String(password || '');
  if (plain.length < 8) {
    throw new Error('管理员密码至少需要 8 个字符。');
  }

  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEM
  });

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64')
  ].join('$');
}

export function isPasswordHash(value) {
  const parts = String(value || '').split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false;
  }

  const [, n, r, p, salt, hash] = parts;
  return Number(n) > 0
    && Number(r) > 0
    && Number(p) > 0
    && toBuffer(salt).length >= 8
    && toBuffer(hash).length >= 32;
}

export function verifyPassword(password, encodedHash) {
  if (!isPasswordHash(encodedHash)) {
    return false;
  }

  const [, n, r, p, salt, hash] = String(encodedHash).split('$');
  const expected = toBuffer(hash);
  const actual = scryptSync(String(password || ''), toBuffer(salt), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAX_MEM
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
