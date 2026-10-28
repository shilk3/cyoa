/**
 * Face ID / Touch ID lock for individual books, using a passkey (WebAuthn) on this device.
 *
 * This is a privacy lock, not encryption: books are stored exactly as before, so a lost or
 * deleted passkey can never cost a book. Unlocking asks the phone to verify the user (Face ID,
 * Touch ID, or the device passcode as the system fallback). If the passkey goes missing, the
 * reader can set the lock up again, which itself requires Face ID or the passcode.
 */

const CREDENTIAL_KEY = 'inkbook:lock-credential';
const EVENT = 'inkbook:lockchange';

const unlocked = new Set<string>();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

function storedCredential(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export class LockError extends Error {}

/** Whether this device can verify the user with Face ID, Touch ID or similar. */
export async function lockAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** The authenticator data's "user verified" flag: Face ID/passcode actually happened. */
function userVerified(authData: ArrayBuffer): boolean {
  const flags = new Uint8Array(authData)[32];
  return (flags & 0x04) !== 0;
}

function explain(e: unknown): LockError {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError') return new LockError('Face ID was cancelled or not recognised.');
  if (name === 'InvalidStateError') return new LockError('A Face ID lock is already set up on this device.');
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return new LockError("This browser can't use Face ID here. On iPhone, make sure iCloud Keychain is turned on.");
  }
  return e instanceof LockError ? e : new LockError(`Face ID didn't work: ${(e as Error)?.message ?? e}`);
}

/**
 * Creates the passkey used for all locked books on this device. Must be called straight from a
 * tap, with no other awaits first, or Safari won't show Face ID (callers check lockAvailable() ahead).
 */
export async function setUpLock(): Promise<void> {
  if (!window.PublicKeyCredential) throw new LockError("This browser doesn't support Face ID or Touch ID for web apps.");
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Inkbook' },
        user: { id: random(16), name: 'Inkbook locked books', displayName: 'Inkbook locked books' },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new LockError('Face ID setup was cancelled.');
    localStorage.setItem(CREDENTIAL_KEY, b64url(cred.rawId));
  } catch (e) {
    throw explain(e);
  }
}

export function lockIsSetUp(): boolean {
  return storedCredential() !== null;
}

/**
 * Asks for Face ID. Resolves when the user is verified; throws LockError otherwise.
 * Must be called straight from a tap: Safari only shows Face ID in response to one.
 */
export async function verifyUser(): Promise<void> {
  const id = storedCredential();
  if (!id) {
    await setUpLock();
    return;
  }
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromB64url(id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const res = cred?.response as AuthenticatorAssertionResponse | undefined;
    if (!res || !userVerified(res.authenticatorData)) throw new LockError('Face ID did not confirm it was you.');
  } catch (e) {
    throw explain(e);
  }
}

export function isUnlocked(bookId: string): boolean {
  return unlocked.has(bookId);
}

/** Verifies the user, then keeps the book open until the app goes to the background. */
export async function unlockBook(bookId: string): Promise<void> {
  await verifyUser();
  unlocked.add(bookId);
  window.dispatchEvent(new Event(EVENT));
}

/** Marks a book open after the user was verified some other way (e.g. setting the lock up again). */
export function markUnlocked(bookId: string): void {
  unlocked.add(bookId);
  window.dispatchEvent(new Event(EVENT));
}

export function relockAll(): void {
  if (unlocked.size === 0) return;
  unlocked.clear();
  window.dispatchEvent(new Event(EVENT));
}

export function onLockChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// Lock everything again whenever the app is switched away from or the phone is locked.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') relockAll();
  });
}
