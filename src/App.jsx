import { For, createSignal } from "solid-js";
import MapGL, { Marker } from "solid-map-gl";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * @typedef {maplibre.LngLat
 *           | { lat: number ; lng: number }
 *           | { lat: number ; lon: number }
 *           | [number, number]} LngLatLike
 * @typedef {import('solid-map-gl').Viewport | {center?: LngLatLike}} Viewport
 * */
/**
 * @template T
 * @typedef {import('solid-js').Accessor<T>} Accessor<T>
 * @typedef {import('solid-js').Setter<T>} Setter<T>
 */

/** @type {LngLatLike} */
const khreshchatyk = { lat: 50.450073051117144, lng: 30.524148046893583 };

/** @returns {JSX.Element} */
function App() {
    /** @type {[Accessor<Viewport>, Setter<Viewport>]} */
    const [viewport, setViewport] = createSignal(
        {
            center: khreshchatyk,
            zoom: 18,
        } /** @satisfies {Viewport} */
    );
    const longitude = () => viewport().center?.lng;
    const latitude = () => viewport().center?.lat;

    const [points, setPoints] = createSignal(new Set(), {
        name: "points",
        equals: setsAreEqual,
    });

    return (
        <>
            <div>
                <p class="text-red-500">
                    Longitude: {longitude()}
                    <br />
                    Latitude: {latitude()}
                </p>
                <MapGL
                    style={{
                        position: "absolute",
                        inset: 0,
                        "z-index": -1,
                        margin: "2rem",
                    }}
                    mapLib={maplibre}
                    options={{
                        style: "https://api.maptiler.com/maps/openstreetmap/style.json?key=dtDYVdcJneIL6GQ3ReDj",
                    }}
                    viewport={viewport()}
                    onViewportChange={setViewport}
                >
                    <For></For>
                    <Marker lngLat={{ lon: 30.524557742843854, lat: 50.45030234317798 }}>Hi there!</Marker>
                </MapGL>
            </div>
        </>
    );
}

export default App;

/**
 * Check if two sets are equal
 *
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {boolean}
 */
function setsAreEqual(a, b) {
    return a.size === b.size && isSubset(a, b);
}

/**
 * Check if `a` is a subset of `b`
 *
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {boolean}
 */
function isSubset(a, b) {
    for (const p of a) {
        if (!b.has(p)) return false;
    }
    return true;
}
