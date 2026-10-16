import { safeStorage } from 'electron';

const PREFIX = 'enc:';

/**
 * Encrypt a secret with the OS keychain (falls back to plain text when the keychain isn't available)
 * @param plain
 */
export const encryptSecret = (plain: string): string => {
    if (!plain || !safeStorage.isEncryptionAvailable()) {
        return plain || '';
    }
    return PREFIX + safeStorage.encryptString(plain).toString('base64');
};

/**
 * Reverse of encryptSecret
 * @param stored
 */
export const decryptSecret = (stored: string): string => {
    if (!stored || !stored.startsWith(PREFIX)) {
        return stored || '';
    }
    try {
        return safeStorage.decryptString(
            Buffer.from(stored.slice(PREFIX.length), 'base64')
        );
    } catch (err) {
        return '';
    }
};
