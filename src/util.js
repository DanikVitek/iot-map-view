/**
 * @template T
 * @param {T} a 
 * @param {T} b 
 * @returns {boolean}
 */
export function structEq(a, b) {
    // primitives and references
    if (a === b) {
        return true;
    }

    // arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!structEq(a[i], b[i])) return false;
        }
        return true;
    }

    // objects
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
        return false;
    }
    const keysA = /** @type {(keyof T)[]} */(Object.keys(a));
    const keysB = /** @type {(keyof T)[]} */(Object.keys(b));
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key) || !structEq(a[key], b[key])) {
            return false;
        }
    }
    return true;
}