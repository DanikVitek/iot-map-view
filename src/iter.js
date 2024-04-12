/**
 * @template T
 * @param {Iterator<T>} iter 
 * @param {number} n
 * @returns {T | undefined}
 */
export function nth(iter, n) {
    return advanceBy(iter, n) ? next(iter) : undefined;
}

/**
 * @template T
 * @param {Iterator<T>} iter
 * @param {number} n
 * @returns {boolean}
 */
export function advanceBy(iter, n) {
    if (n < 0) {
        throw new Error('n must be non-negative')
    }
    for (let i = 0; i < n; i++) {
        const result = iter.next();
        if (result.done) {
            return false;
        }
    }
    return true;
}

/**
 * @template T
 * @param {Iterator<T>} iter
 * @returns {T | undefined}
 */
export function next(iter) {
    const result = iter.next();
    if (result.done) {
        return undefined;
    } else {
        return result.value;
    }
}