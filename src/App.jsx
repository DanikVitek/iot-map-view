// @ts-check

import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { webSocket } from "rxjs/webSocket";
import MapGL, { Marker } from "solid-map-gl";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import car from "./assets/car.png";

/** @typedef {import("solid-js").JSXElement} JSXElement */
/**
 * @typedef {mapboxgl.LngLatLike} LngLatLike
 * @typedef {import('solid-map-gl').Viewport & {center?: LngLatLike}} Viewport
 * */
/**
 * @template T
 * @typedef {import('solid-js').Accessor<T>} Accessor<T>
 */
/**
 * @template T
 * @typedef {import('solid-js').Signal<T>} Signal<T>
 */
/**
 * @template T
 * @typedef {import('solid-js').Setter<T>} Setter<T>
 */
/**
 * @template T
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
 *  }} Data
 * @typedef {{
 *      kind: "new" | "update",
 *      id: Id,
 *      data: Data,
 *  } | {
 *      kind: "new" | "update",
 *      id: Id[],
 *      data: Data[],
 *  } | {
 *      kind: "delete",
 *      id: Id[] | Id,
 *      data_type: string,
 *  }} Message
 */

const OPEN_STREET_MAP = "https://api.maptiler.com/maps/openstreetmap/style.json?key=dtDYVdcJneIL6GQ3ReDj";
const TOPO_V2 = "https://api.maptiler.com/maps/topo-v2/style.json?key=dtDYVdcJneIL6GQ3ReDj";
const SATELLITE = "https://api.maptiler.com/maps/satellite/style.json?key=dtDYVdcJneIL6GQ3ReDj";

const INITIAL_VIEWPORT = /** @type {const} @satisfies {Viewport} */ ({
    center: { lat: 30.52013606276688, lng: 50.45045314605352 },
    zoom: 15,
});

/** @returns {JSXElement} */
function App() {
    const [viewport, setViewport] = createSignal(INITIAL_VIEWPORT);

    const [host, setHost] = createSignal(/** @type {string | undefined} */ (undefined));
    const [port, setPort] = createSignal(/** @type {number | undefined} */ (undefined));
    const endpoint = () =>
        host() !== undefined && port() !== undefined ? `ws://${host()}:${port()}/api/ws` : undefined;

    const ws = createMemo(
        /** @param {WebSocketSubject<Blob> | undefined} prevWs */ (prevWs) => {
            if (prevWs) {
                prevWs.unsubscribe();
                prevWs.complete();
            }
            const url = endpoint();
            if (url) {
                return webSocket({
                    url,
                    binaryType: "blob",
                    deserializer: (e) => /** @type {Blob} */ (e.data),
                });
            }
            return undefined;
        }
    );

    const [data, setData] = createSignal(/** @type {Map<Id, { gps: Gps, road_state: RoadState }>} */ (new Map()), {
        name: "data",
        equals: false,
    });

    const [agentMarker, setAgentMarker] = createSignal(/** @type {[LngLatLike, RoadState] | undefined} */ (undefined));

    const [t, setT] = createSignal(0);

    setInterval(() => {
        // lerp between first two stored points and set agentMarker. When current lerp is finished, remove the first point.

        const dataIter = data().entries();
        const firstResult = dataIter.next();
        const secondResult = dataIter.next();
        if (firstResult.done || secondResult.done) {
            return;
        }

        const [firstId, first] = firstResult.value;
        const [, second] = secondResult.value;

        const interpolated = lerpGps(first.gps, second.gps, t());

        setAgentMarker([{ lng: interpolated.longitude, lat: interpolated.latitude }, first.road_state]);
        setT((prev) => {
            let next = prev + 0.1;
            if (next >= 1) {
                next = 0;
            }
            return next;
        });
        if (t() === 0) {
            setData((prev) => {
                prev.delete(firstId);
                return prev;
            });
        }
    }, 9);

    createEffect(
        () => {
            const subject = ws();
            if (subject) {
                subject.subscribe({
                    next: (data) => {
                        data.text()
                            .then((json) => /** @type {Message} */ (JSON.parse(json)))
                            .then((data) => {
                                switch (data.kind) {
                                    case "new":
                                    case "update":
                                        setData((prev) => {
                                            if (Array.isArray(data.id)) {
                                                for (let i = 0; i < data.id.length; i++) {
                                                    prev.set(data.id[i], {
                                                        gps: /** @type {Data[]} */ (data.data)[i].gps,
                                                        road_state: /** @type {Data[]} */ (data.data)[i].road_state,
                                                    });
                                                }
                                            } else {
                                                prev.set(data.id, {
                                                    gps: /** @type {Data} */ (data.data).gps,
                                                    road_state: /** @type {Data} */ (data.data).road_state,
                                                });
                                            }
                                            return prev;
                                        });
                                        break;
                                    case "delete":
                                        setData((prev) => {
                                            if (Array.isArray(data.id)) {
                                                for (let i = 0; i < data.id.length; i++) {
                                                    prev.delete(data.id[i]);
                                                }
                                            } else {
                                                prev.delete(data.id);
                                            }
                                            return prev;
                                        });
                                        break;
                                }
                            });
                    },
                    error: (err) => {
                        console.error({ err });
                        if (err instanceof CloseEvent) {
                            setData((prev) => {
                                prev.clear();
                                return prev;
                            });
                            setAgentMarker(undefined);
                        }
                    },
                    complete: () => console.log("complete"),
                });
            }
        },
        undefined,
        { name: "ws.subscribe" }
    );

    const [style, setStyle] = createSignal(OPEN_STREET_MAP);

    return (
        <main>
            <MapGL
                class="absolute inset-0 -z-[1]"
                mapLib={maplibre}
                options={{
                    style: style(),
                }}
                viewport={viewport()}
                onViewportChange={setViewport}
            >
                <Show when={agentMarker()}>
                    {
                        /**
                         * @param {Accessor<[LngLatLike, RoadState]>} lngLat
                         * @returns {JSXElement}
                         */
                        (lngLat) => (
                            <Marker
                                lngLat={lngLat()[0]}
                                options={{
                                    element: /** @type {HTMLImageElement} */ (<img src={car} width={40} height={63} />),
                                    offset: [0, -31],
                                }}
                            />
                        )
                    }
                </Show>
                <form
                    class="form-control absolute left-5 top-5 grid grid-cols-2 grid-rows-3 gap-2 rounded-md bg-primary p-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        /** @type {string | undefined} */
                        const host = e.currentTarget.host.value;
                        /** @type {number | undefined} */
                        const port = e.currentTarget.port.value;
                        setHost(host ? host : "localhost");
                        setPort(port ? port : 8080);
                    }}
                >
                    <label
                        for="host"
                        class="input input-bordered input-primary col-span-2 flex items-center gap-2 text-primary-content"
                    >
                        Host:
                        <input id="host" class="grow" type="text" placeholder="localhost" />
                    </label>
                    <label
                        for="port"
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

                <div class="absolute right-5 top-5 w-fit min-w-10">
                    <select
                        class="select select-bordered select-primary rounded-md border-2"
                        onChange={(e) => setStyle(e.target.value)}
                    >
                        <option selected value={OPEN_STREET_MAP}>
                            OpenStreetMap
                        </option>
                        <option value={TOPO_V2}>Topo v2</option>
                        <option value={SATELLITE}>Satellite</option>
                    </select>
                </div>

                <div class="absolute bottom-5 left-5 h-fit w-fit rounded-md bg-neutral p-2">
                    <table class="table table-sm w-64 table-auto text-neutral-content">
                        <tbody>
                            <tr>
                                <th scope="row">Points</th>
                                <td>{data().size}</td>
                            </tr>
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
 * @param {Gps} a
 * @param {Gps} b
 * @param {number} t
 * @returns {Gps}
 */
function lerpGps(a, b, t) {
    return {
        latitude: lerp(a.latitude, b.latitude, t),
        longitude: lerp(a.longitude, b.longitude, t),
    };
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}
