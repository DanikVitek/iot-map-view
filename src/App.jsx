import { For, createEffect, createMemo, createSignal, from, on } from "solid-js";
import { webSocket } from "rxjs/webSocket";
import MapGL, { Marker } from "solid-map-gl";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { template } from "solid-js/web";

/**
 * @typedef {maplibre.LngLat
 *           | { lat: number ; lng: number }
 *           | { lat: number ; lon: number }
 *           | [number, number]} LngLatLike
 * @typedef {import('solid-map-gl').Viewport & {center?: LngLatLike}} Viewport
 * */
/**
 * @template T
 * @typedef {import('solid-js').Accessor<T>} Accessor<T>
 * @typedef {import('solid-js').Setter<T>} Setter<T>
 * @typedef {import('solid-js').Signal<T>} Signal<T>
 * @typedef {import('rxjs/webSocket').WebSocketSubject<T>} WebSocketSubject<T>
 */

/**
 * @typedef {number} Id
 * @typedef {{ x: number, y: number, z: number }} Accelerometer
 * @typedef {{ latitude: number, longitude: number }} Gps
 * @typedef {"SMOOTH" | "ROUGH"} RoadState
 * @typedef {{
 *      accelerometer: Accelerometer,
 *      gps: Gps,
 *      road_state: RoadState,
 *      timestamp: string,
 * }} Data
 * @typedef {{
 *      kind: "new",
 *      id: [Id],
 *      data: [Data],
 *  } | {
 *      kind: "update",
 *      id: [Id],
 *      data: [Data],
 *  } | {
 *      kind: "delete",
 *      id: [Id],
 *      data_type: string,
 *  }} Message
 */

/** @type {LngLatLike} */
const center = { lat: 30.52013606276688, lng: 50.45045314605352 };

/** @returns {JSX.Element} */
function App() {
    const [viewport, setViewport] = createSignal(
        /** @satisfies {Viewport} */ ({
            center,
            zoom: 15,
        })
    );

    const [host, setHost] = createSignal(/** @type {string | undefined} */ (undefined));
    const [port, setPort] = createSignal(/** @type {number | undefined} */ (undefined));

    const ws = createMemo((prevWs) => {
        if (prevWs) {
            prevWs.complete();
        }
        if (host() !== undefined && port() !== undefined) {
            return webSocket({
                url: `ws://${host()}:${port()}/api/ws`,
                binaryType: "blob",
                deserializer: (e) => /** @type {Blob} */ (e.data),
            });
        }
        return undefined;
    });

    const [data, setData] = createSignal(/** @type {Map<Id, Gps>} */ (new Map()), {
        name: "data",
    });

    const points = createMemo(() => new Set(data().values()), new Set(), {
        name: "points",
    });

    createEffect(
        () => {
            const subject = ws();
            if (subject) {
                subject.subscribe({
                    next: (data) => {
                        data.text()
                            .then((json) => /** @type {Message} */ (JSON.parse(json)))
                            .then((data) => {
                                // console.log(data);
                                switch (data.kind) {
                                    case "new":
                                        setData((prev) => {
                                            for (let i = 0; i < data.id.length; i++) {
                                                prev.set(data.id[i], data.data[i].gps);
                                            }
                                            return new Map(prev);
                                        });
                                        break;
                                    case "update":
                                        setPoints((prev) => {
                                            for (let i = 0; i < data.id.length; i++) {
                                                prev.set(data.id[i], data.data[i].gps);
                                            }
                                            return new Map(prev);
                                        });
                                        break;
                                    case "delete":
                                        setData((prev) => {
                                            for (let i = 0; i < data.id.length; i++) {
                                                prev.delete(data.id[i]);
                                            }
                                            return new Map(prev);
                                        });
                                        break;
                                }
                            });
                    },
                    error: (err) => {
                        console.error({ err });
                        if (err instanceof CloseEvent) {
                            console.error("WebSocket closed with code", err.code);
                            setData(new Map());
                        }
                    },
                    complete: () => {
                        console.log("complete");
                    },
                });
            }
        },
        undefined,
        { name: "ws.subscribe" }
    );

    createEffect(
        () => {
            console.log("points", points());
        },
        undefined,
        { name: "points" }
    );

    return (
        <main>
            <MapGL
                class="absolute inset-0 -z-[1]"
                mapLib={maplibre}
                options={{
                    style: "https://api.maptiler.com/maps/openstreetmap/style.json?key=dtDYVdcJneIL6GQ3ReDj",
                }}
                viewport={viewport()}
                onViewportChange={setViewport}
            >
                <For each={[...points().values()]}>
                    {
                        /** @param {Gps} point */
                        (point) => <Marker lngLat={{ lon: point.longitude, lat: point.latitude }}>Hi there!</Marker>
                    }
                </For>
                <form
                    class="form-control absolute left-5 top-5 grid grid-cols-2 grid-rows-3 gap-2 rounded-md bg-primary p-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setHost(e.currentTarget.host.value ? e.currentTarget.host.value : "localhost");
                        setPort(e.currentTarget.port.value ? e.currentTarget.port.value : 8080);
                    }}
                >
                    <label
                        htmlFor="host"
                        class="input input-bordered input-primary col-span-2 flex items-center gap-2 text-primary-content"
                    >
                        Host:
                        <input id="host" class="grow" type="text" placeholder="localhost" />
                    </label>
                    <label
                        htmlFor="port"
                        class="input input-bordered input-primary col-span-2 flex items-center gap-2 text-primary-content"
                    >
                        Port:
                        <input id="port" class="grow" type="number" min={1} max={65535} placeholder="8080" />
                    </label>
                    <input type="submit" class="btn btn-secondary col-span-1 text-secondary-content" value="Connect" />
                    <input
                        type="reset"
                        class="btn btn-secondary col-span-1 text-secondary-content"
                        value="Disconnect"
                        onClick={() => {
                            setHost(undefined);
                            setPort(undefined);
                        }}
                    />
                </form>

                <div class="absolute bottom-5 left-5 h-fit w-fit rounded-md bg-neutral p-2">
                    <table class="table table-sm w-64 table-auto text-neutral-content">
                        <tbody>
                            <tr>
                                <th scope="row">Longitude</th>
                                <td>{viewport().center?.lng}</td>
                            </tr>
                            <tr>
                                <th scope="row">Latitude</th>
                                <td>{viewport().center?.lat}</td>
                            </tr>
                            <tr>
                                <th scope="row">Zoom</th>
                                <td>{viewport().zoom}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </MapGL>
        </main>
    );
}

export default App;

/**
 * Check if two maps are equal
 *
 * @template K,V
 * @param {Map<K,V>} a
 * @param {Map<K,V>} b
 * @returns {boolean}
 */
function mapsAreEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
        if (v !== b.get(k)) return false;
    }
    return true;
}

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
