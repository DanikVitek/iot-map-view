/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * @typedef {{
 *      peakHeights: number[],
 *      prominences: number[],
 *      leftBases: number[],
 *      rightBases: number[]
 *      widths: number[],
 *      widthHeights: number[],
 *      leftIps: number[],
 *      rightIps: number[]
 *  }} Properties
 */

/**
 * @param {number[]} x A signal with peaks
 * @param {object} [options]
 * @param {number | number[] | null} [options.height]
 *      Required height of peaks. Either a number, ``None``, an array matching
 *      `x` or a 2-element sequence of the former. The first element is
 *      always interpreted as the  minimal and the second, if supplied, as the
 *      maximal required height.
 * @param {number | null} [options.distance]
 *      Required minimal horizontal distance (>= 1) in samples between
 *      neighbouring peaks. Smaller peaks are removed first until the condition
 *      is fulfilled for all remaining peaks.
 * @param {number | number[] | null} [options.prominence]
 *      Required prominence of peaks. Either a number, ``None``, an array
 *      matching `x` or a 2-element sequence of the former. The first
 *      element is always interpreted as the  minimal and the second, if
 *      supplied, as the maximal required prominence.
 * @param {number | number[] | null} [options.width]
 *      Required width of peaks in samples. Either a number, ``None``, an array
 *      matching `x` or a 2-element sequence of the former. The first
 *      element is always interpreted as the  minimal and the second, if
 *      supplied, as the maximal required width.
 *
 *  Returns
 *  -------
 *  peaks : ndarray
 *      Indices of peaks in `x` that satisfy all given conditions.
 *  properties : dict
 *      A dictionary containing properties of the returned peaks which were
 *      calculated as intermediate results during evaluation of the specified
 *      conditions:
 *
 *      - 'peakHeights'
 *            If `height` is given, the height of each peak in `x`.
 *      - 'prominences', 'rightBases', 'leftBases'
 *            If `prominence` is given, these keys are accessible. See
 *            `peakProminences` for a description of their content.
 *      - 'widthHeights', 'leftIps', 'rightIps'
 *            If `width` is given, these keys are accessible. See `peakWidths`
 *            for a description of their content.
 *
 *      To calculate and return properties without excluding peaks, provide the
 *      open interval ``(None, None)`` as a value to the appropriate argument
 *      (excluding `distance`).
 *
 * @returns {{
 *      peaks: number[],
 *      properties: Partial<Properties>
 * }}
 */
export function findPeaks(x, options) {
    const {
        height,
        distance,
        prominence,
        width,
    } = options || {}

    if (isSome(distance) && distance < 1) {
        throw Error('`distance` must be greater or equal to 1')
    }

    const { midpoints, leftEdges, rightEdges } = localMaxima1D(x);
    let peaks = midpoints;

    /** @type {Partial<Properties>} */
    const properties = {}

    if (isSome(height)) {
        // Evaluate height condition
        const peakHeights = peaks.map((i) => x[i])
        const [hmin, hmax] = unpackConditionArgs(height, x, peaks)
        const keep = selectByProperty(peakHeights, hmin, hmax)
        peaks = peaks.filter((_, i) => keep[i])
        properties.peakHeights = peakHeights;
    }
    if (isSome(distance)) {
        // Evaluate distance condition
        const keep = selectByPeakDistance(peaks, peaks.map((i) => x[i]), distance)
        peaks = peaks.filter((_, i) => keep[i])
        properties.peakHeights = properties.peakHeights?.filter((_, i) => keep[i])
    }
    if (isSome(prominence) || isSome(width)) {
        // Calculate prominence (required for both conditions)
        const wlen = -1
        const res = peakProminences(x, peaks, wlen)
        properties.prominences = res.prominences
        properties.leftBases = res.leftBases
        properties.rightBases = res.rightBases
    }
    if (isSome(prominence)) {
        // Evaluate prominence condition
        const [pmin, pmax] = unpackConditionArgs(prominence, x, peaks)
        const keep = selectByProperty(/** @type {number[]} */(properties.prominences), pmin, pmax)
        peaks = peaks.filter((_, i) => keep[i])
        for (const [key, value] of Object.entries(properties)) {
            properties[/** @type {keyof Properties} */ (key)] = value.filter((_, i) => keep[i])
        }
    }
    if (isSome(width)) {
        // Calculate widths

        const relHeight = 0
        const res = peakWidths(
            x, peaks, relHeight,
            /** @type {number[]} */(properties.prominences),
            /** @type {number[]} */(properties.leftBases),
            /** @type {number[]} */(properties.rightBases)
        );
        properties.widths = res.widths
        properties.widthHeights = res.widthHeights
        properties.leftIps = res.leftIps
        properties.rightIps = res.rightIps

        // Evaluate width condition
        const [wmin, wmax] = unpackConditionArgs(width, x, peaks)
        const keep = selectByProperty(/** @type {number[]} */(properties.widths), wmin, wmax)
        peaks = peaks.filter((_, i) => keep[i])
        for (const [key, value] of Object.entries(properties)) {
            properties[/** @type {keyof Properties} */ (key)] = value.filter((_, i) => keep[i])
        }
    }
    return { peaks, properties }
}

/**
 * @template T
 * @param {T | undefined | null} v 
 * @returns {v is NonNullable<T>}
 */
function isSome(v) {
    return v !== undefined && v !== null
}

/** @param {number[]} x */
function localMaxima1D(x) {
    /** @type {number[]} */
    const midpoints = [];
    /** @type {number[]} */
    const leftEdges = [];
    /** @type {number[]} */
    const rightEdges = [];

    let i = 0;
    const iMax = x.length - 1;
    while (i < iMax) {
        if (x[i - 1] < x[i]) {
            let iAhead = i + 1;

            while (iAhead < iMax && x[iAhead] === x[i]) {
                iAhead += 1;
            }

            if (x[iAhead] < x[i]) {
                leftEdges.push(i)
                rightEdges.push(iAhead - 1);
                midpoints.push((leftEdges[leftEdges.length - 1] + rightEdges[rightEdges.length - 1]) / 2);
                i = iAhead;
            }
        }
        i += 1
    }

    return {
        midpoints,
        leftEdges,
        rightEdges,
    }
}

/**
 * 
 * @param {*} interval 
 * @param {number[]} x
 * @param {number[]} peaks 
 * @returns {[number | number[], number | number[] | null]}
 */
function unpackConditionArgs(interval, x, peaks) {
    /** @type {number | number[]} */
    let imin;
    /** @type {number | number[] | null} */
    let imax;
    try {
        [imin, imax] = interval;
    } catch (e) {
        imin = interval;
        imax = null;
    }

    if (Array.isArray(imin)) {
        if (imin.length !== x.length) {
            throw Error('array size of lower interval border must match x')
        }
        imin = peaks.map((i) => /** @type {number[]} */(imin)[i])
    }
    if (Array.isArray(imax)) {
        if (imax.length !== x.length) {
            throw Error('array size of upper interval border must match x')
        }
        imax = peaks.map((i) => /** @type {number[]} */(imax)[i])
    }

    return [imin, imax]
}

/**
 * @param {number[]} peakProperties 
 * @param {number | number[] | null} [pmin] 
 * @param {number | number[] | null} [pmax] 
 * @returns 
 */
function selectByProperty(peakProperties, pmin, pmax) {
    /** @type {boolean[]} */
    const keep = new Array(peakProperties.length).fill(true)

    if (isSome(pmin)) {
        if (Array.isArray(pmin)) {
            for (let i = 0; i < peakProperties.length; i++) {
                keep[i] &&= pmin[i] <= peakProperties[i];
            }
        } else {
            for (let i = 0; i < peakProperties.length; i++) {
                keep[i] &&= pmin <= peakProperties[i];
            }
        }
    }
    if (isSome(pmax)) {
        if (Array.isArray(pmax)) {
            for (let i = 0; i < peakProperties.length; i++) {
                keep[i] &&= peakProperties[i] <= pmax[i];
            }
        } else {
            for (let i = 0; i < peakProperties.length; i++) {
                keep[i] &&= peakProperties[i] <= pmax;
            }
        }
    }

    return keep
}

/**
 * @param {number[]} peaks
 * @param {number[]} priority
 * @param {number} distance
 * @returns {boolean[]}
 */
function selectByPeakDistance(peaks, priority, distance) {
    const peaksSize = peaks.length
    const distance_ = Math.ceil(distance)
    /** @type {boolean[]} */
    const keep = new Array(peaksSize).fill(true)

    // indices that would sort the priority array
    const priorityToPosition = priority.map((p, i) => [p, i]).sort(([a], [b]) => a - b).map(([, i]) => i)

    for (let i = peaksSize - 2; i >= -1; i--) {
        const j = priorityToPosition[i];
        if (keep[j] === false) {
            continue;
        }

        let k = j - 1;
        while (0 <= k && peaks[j] - peaks[k] < distance_) {
            keep[k] = false;
            k -= 1;
        }

        k = j + 1;
        while (k < peaksSize && peaks[k] - peaks[j] < distance_) {
            keep[k] = false;
            k += 1;
        }
    }

    return keep
}

/**
 * 
 * @param {number[]} x 
 * @param {number[]} peaks 
 * @param {number} wlen
 */
function peakProminences(x, peaks, wlen) {
    let showWarning = false;
    /** @type {number[]} */
    const prominences = new Array(peaks.length);
    /** @type {number[]} */
    const leftBases = new Array(peaks.length);
    /** @type {number[]} */
    const rightBases = new Array(peaks.length);

    for (let peakNr = 0; peakNr < peaks.length; peakNr++) {
        const peak = peaks[peakNr];
        let iMin = 0;
        let iMax = x.length - 1;
        if (!(iMin <= peak && peak <= iMax)) {
            throw Error(`peak ${peak} is not a valid index for \`x\``)
        }
        if (2 <= wlen) {
            iMin = Math.max(0, peak - wlen);
            iMax = Math.min(x.length - 1, peak + wlen);
        }

        let i = leftBases[peakNr] = peak;
        let leftMin = x[peak];
        while (iMin <= i && x[i] <= x[peak]) {
            if (x[i] < leftMin) {
                leftMin = x[i];
                leftBases[peakNr] = i;
            }
            i -= 1;
        }

        i = rightBases[peakNr] = peak;
        let rightMin = x[peak];
        while (i <= iMax && x[i] <= x[peak]) {
            if (x[i] < rightMin) {
                rightMin = x[i];
                rightBases[peakNr] = i;
            }
            i += 1;
        }

        prominences[peakNr] = x[peak] - Math.max(leftMin, rightMin);
        if (prominences[peakNr] == 0) {
            showWarning = true;
        }
    }

    if (showWarning) {
        console.warn('Some peaks have a prominence of 0')
    }

    return { prominences, leftBases, rightBases }
}

/**
 * @param {number[]} x 
 * @param {number[]} peaks 
 * @param {number} relHeight 
 * @param {number[]} prominences 
 * @param {number[]} leftBases 
 * @param {number[]} rightBases 
 */
function peakWidths(x, peaks, relHeight, prominences, leftBases, rightBases) {
    if (relHeight < 0) {
        throw Error('`relHeight` must be greater or equal to 0')
    }
    if (!(peaks.length == prominences.length && prominences.length == leftBases.length && leftBases.length == rightBases.length)) {
        throw Error('`peaks`, `prominences`, `leftBases` and `rightBases` must have the same length')
    }

    let showWarning = false;
    /** @type {number[]} */
    const widths = new Array(peaks.length);
    /** @type {number[]} */
    const widthHeights = new Array(peaks.length);
    /** @type {number[]} */
    const leftIps = new Array(peaks.length);
    /** @type {number[]} */
    const rightIps = new Array(peaks.length);

    for (let p = 0; p < peaks.length; p++) {
        const peak = peaks[p];
        let iMin = leftBases[p];
        let iMax = rightBases[p];

        if (!(0 <= iMin && iMin <= peak && peak <= iMax && iMax < x.length)) {
            throw Error(`prominence data is invalid for peak ${peak}`)
        }

        const height = widthHeights[p] = x[peak] - prominences[p] * relHeight;

        let i = peak;
        while (iMin < i && height < x[i]) {
            i -= 1;
        }

        let leftIp = i;
        if (x[i] < height) {
            leftIp += (height - x[i]) / (x[i + 1] - x[i]);
        }

        i = peak;
        while (i < iMax && height < x[i]) {
            i += 1;
        }

        let rightIp = i;
        if (x[i] < height) {
            rightIp -= (height - x[i]) / (x[i - 1] - x[i]);
        }

        widths[p] = rightIp - leftIp;
        if (widths[p] == 0) {
            showWarning = true;
        }

        leftIps[p] = leftIp;
        rightIps[p] = rightIp;
    }

    if (showWarning) {
        console.warn('Some peaks have a width of 0')
    }

    return { widths, widthHeights, leftIps, rightIps }
}