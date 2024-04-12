//#region Imports
import { For, Index, Show, createEffect, createMemo, createSignal } from "solid-js";
import { webSocket } from "rxjs/webSocket";
import MapGL, { Marker } from "solid-map-gl";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import car from "./assets/car.png";
import bump from "./assets/bump.png";
import pothole from "./assets/pothole.png";
import { twMerge } from "tailwind-merge";
import { findPeaks, lerp } from "./math";
import { next, nth } from "./iter";
import { structEq } from "./util";
//#endregion

//#region Types
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
//#endregion

const OPEN_STREET_MAP = "https://api.maptiler.com/maps/openstreetmap/style.json?key=dtDYVdcJneIL6GQ3ReDj";
const TOPO_V2 = "https://api.maptiler.com/maps/topo-v2/style.json?key=dtDYVdcJneIL6GQ3ReDj";
const SATELLITE = "https://api.maptiler.com/maps/satellite/style.json?key=dtDYVdcJneIL6GQ3ReDj";

const INITIAL_VIEWPORT = /** @type {const} @satisfies {Viewport} */ ({
    center: { lat: 30.52013606276688, lng: 50.45045314605352 },
    zoom: 15,
});

const BASE_ACCELERATION = 16667; // 1g = 9.81 m/s^2 = 16667 units
const ACCELERATION_UNIT = 6e-5;

//#region App
/** @returns {JSXElement} */
function App() {
    const [host, setHost] = createSignal(/** @type {string | undefined} */ (undefined));
    const [port, setPort] = createSignal(/** @type {number | undefined} */ (undefined));
    const endpoint = () =>
        host() === undefined || port() === undefined ? undefined : `ws://${host()}:${port()}/api/ws`;

    const ws = createMemo(
        /** @param {WebSocketSubject<Blob> | undefined} prevWs */ (prevWs) => {
            if (prevWs) {
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

    /** @typedef {{gps: Gps, road_state: RoadState}} Loc */

    /**
     * @function
     * @param {Message} msg
     * @param {Map<Id, Data>} prev
     * @returns {Map<Id, Data>}
     */
    const processMessage = (msg, prev) => {
        switch (msg.kind) {
            case "new":
            case "update":
                if (Array.isArray(msg.id)) {
                    for (let i = 0; i < msg.id.length; i++) {
                        prev.set(msg.id[i], /** @type {Data[]} */ (msg.data)[i]);
                    }
                } else {
                    prev.set(msg.id, /** @type {Data} */ (msg.data));
                }
                return prev;

            case "delete":
                if (Array.isArray(msg.id)) {
                    for (let i = 0; i < msg.id.length; i++) {
                        prev.delete(msg.id[i]);
                    }
                } else {
                    prev.delete(msg.id);
                }
                return prev;
        }
    };

    const [data, setData] = createSignal(/** @type {Map<Id, Data>} */ (new Map()), {
        name: "data",
        equals: false,
    });

    //#region Subscribe to WebSocket
    createEffect(
        () => {
            const subject = ws();
            if (subject) {
                subject.subscribe({
                    next: (data) => {
                        data.text()
                            .then((json) => /** @type {Message} */ (JSON.parse(json)))
                            .then((msg) => {
                                // console.log(msg);
                                setData((prev) => processMessage(msg, prev));
                            })
                            .catch(console.error);
                    },
                    error: (err) => {
                        if (err instanceof CloseEvent) {
                            console.log("WebSocket closed", err);
                            setData((prev) => {
                                prev.clear();
                                return prev;
                            });
                            setAgentMarker(undefined);
                        } else {
                            console.error({ err });
                        }
                    },
                    complete: () => console.log("complete"),
                });
            }
        },
        undefined,
        { name: "ws.subscribe" }
    );
    //#endregion

    //#region Agent marker
    const [agentMarker, setAgentMarker] = createSignal(/** @type {[LngLatLike, RoadState] | undefined} */ (undefined));

    let t = 0;

    setInterval(() => {
        const dataIter = data().values();
        const i = Math.floor(t);
        const first = nth(dataIter, i);
        const second = next(dataIter);
        if (first === undefined || second === undefined) {
            return;
        }

        // const [firstId, first] = firstResult;
        // const [, second] = secondResult;

        const interpolated = lerpGps(first.gps, second.gps, t - i);

        setAgentMarker([{ lng: interpolated.longitude, lat: interpolated.latitude }, first.road_state]);
        t += 0.1;
        // if (t >= 1) {
        //     t = 0;
        // }
        // if (t === 0) {
        //     setData((prev) => {
        //         prev.delete(firstId);
        //         return prev;
        //     });
        // }
    }, 9);
    //#endregion

    //#region Road markers
    /** @typedef {{gps: Gps, state: "bump" | "pothole", z: number}} RoadMarker */

    const roadMarkers = createMemo(
        /**
         * @param {RoadMarker[]} prev
         * @returns {RoadMarker[]}
         */
        (prev) => {
            if (agentMarker() === undefined) {
                return [];
            }
            if (data().size < 15) {
                return prev;
            }

            const points = Array.from(data().values());
            const maximas = findPeaks(
                points.map((p) => p.accelerometer.z - BASE_ACCELERATION),
                {
                    height: 100,
                    distance: 1,
                    prominence: 0,
                    width: 0,
                }
            );
            const minimas = findPeaks(
                points.map((p) => -p.accelerometer.z + BASE_ACCELERATION),
                {
                    height: 200,
                    distance: 3,
                    prominence: 0,
                    width: 0,
                }
            );

            /** @type {RoadMarker[]} */
            const newMarkers = new Array(maximas.peaks.length + minimas.peaks.length);

            let i = 0;
            let j = 0;
            while (i < maximas.peaks.length && j < minimas.peaks.length) {
                if (maximas.peaks[i] < minimas.peaks[j]) {
                    newMarkers[i + j] = {
                        gps: points[maximas.peaks[i]].gps,
                        state: "bump",
                        z: points[maximas.peaks[i]].accelerometer.z - BASE_ACCELERATION,
                    };
                    i++;
                } else {
                    newMarkers[i + j] = {
                        gps: points[minimas.peaks[j]].gps,
                        state: "pothole",
                        z: points[minimas.peaks[j]].accelerometer.z - BASE_ACCELERATION,
                    };
                    j++;
                }
            }
            while (i < maximas.peaks.length) {
                newMarkers[i + j] = {
                    gps: points[maximas.peaks[i]].gps,
                    state: "bump",
                    z: points[maximas.peaks[i]].accelerometer.z - BASE_ACCELERATION,
                };
                i++;
            }
            while (j < minimas.peaks.length) {
                newMarkers[i + j] = {
                    gps: points[minimas.peaks[j]].gps,
                    state: "pothole",
                    z: points[minimas.peaks[j]].accelerometer.z - BASE_ACCELERATION,
                };
                j++;
            }

            return newMarkers;
        },
        /** @type {RoadMarker[]} */ ([]),
        {
            name: "roadMarkers",
            equals: structEq,
        }
    );
    //#endregion

    const [viewport, setViewport] = createSignal(INITIAL_VIEWPORT);
    const [style, setStyle] = createSignal(OPEN_STREET_MAP);

    //#region App view
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
                         * @param {Accessor<[LngLatLike, RoadState]>} agentMarker
                         * @returns {JSXElement}
                         */
                        (agentMarker) => (
                            <Marker
                                lngLat={agentMarker()[0]}
                                popup={{
                                    closeOnMove: false,
                                }}
                                options={{
                                    element: /** @type {HTMLImageElement} */ (<img src={car} width={40} height={63} />),
                                    offset: [0, -31],
                                }}
                            />
                        )
                    }
                </Show>

                <Index each={roadMarkers()}>
                    {(roadMarker, index) => (
                        <Marker
                            data-index={index}
                            lngLat={{ lng: roadMarker().gps.longitude, lat: roadMarker().gps.latitude }}
                            popup={{
                                closeOnMove: false,
                            }}
                            options={{
                                element: /** @type {HTMLImageElement} */ (
                                    <img src={roadMarker().state === "bump" ? bump : pothole} width={51} height={51} />
                                ),
                            }}
                        >
                            {roadMarker().z.toString()}
                        </Marker>
                    )}
                </Index>

                <ConnectionForm class="absolute left-5 top-5 bg-primary" setHost={setHost} setPort={setPort} />

                <MapStyleSelect
                    class="absolute right-5 top-5 w-fit min-w-10"
                    setStyle={setStyle}
                    options={Object.freeze({
                        OpenStreetMap: OPEN_STREET_MAP,
                        "Topo v2": TOPO_V2,
                        Satellite: SATELLITE,
                    })}
                />

                <div class="absolute bottom-5 left-5 h-fit w-fit rounded-md bg-neutral p-2">
                    <StatsTable
                        points={data().size}
                        longitude={viewport().center?.lng}
                        latitude={viewport().center?.lat}
                        zoom={viewport().zoom}
                    />
                </div>
            </MapGL>
        </main>
    );
    //#endregion
}

export default App;
//#endregion

//#region ConnectionForm
/**
 * @param {{
 *      class?: string,
 *      setHost: Setter<string | undefined>,
 *      setPort: Setter<number | undefined>,
 * }} props
 * @returns {JSXElement}
 */
function ConnectionForm(props) {
    return (
        <form
            class={twMerge("form-control grid grid-cols-2 grid-rows-3 gap-2 rounded-md p-2", props.class)}
            onSubmit={(e) => {
                e.preventDefault();
                /** @type {string | undefined} */
                const host = e.currentTarget.host?.value;
                /** @type {number | undefined} */
                const port = e.currentTarget.port?.value;
                props.setHost(host ? host : "localhost");
                props.setPort(port ? port : 8080);
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
                    props.setHost(undefined);
                    props.setPort(undefined);
                }}
            />
        </form>
    );
}
//#endregion

//#region MapStyleSelect
/**
 * @param {{
 *      class?: string,
 *      setStyle: Setter<string>,
 *      options: Record<string, string>
 * }} props
 * @returns {JSXElement}
 */
function MapStyleSelect(props) {
    return (
        <select
            name="map-style"
            class={twMerge("select select-bordered select-primary rounded-md border-2", props.class)}
            onChange={(e) => props.setStyle(e.target.value)}
        >
            {Object.entries(props.options).map(([name, value], index) => (
                <option selected={index === 0} value={value}>
                    {name}
                </option>
            ))}
        </select>
    );
}
//#endregion

//#region StatsTable
/**
 * @param {{
 *      points: number,
 *      longitude: number,
 *      latitude: number,
 *      zoom: number,
 * }} props
 * @returns {JSXElement}
 */
function StatsTable(props) {
    return (
        <table class="table table-sm w-64 table-auto text-neutral-content">
            <tbody>
                <tr>
                    <th scope="row">Points</th>
                    <td>{props.points}</td>
                </tr>
                <tr>
                    <th scope="row">Longitude</th>
                    <td>{props.longitude}</td>
                </tr>
                <tr>
                    <th scope="row">Latitude</th>
                    <td>{props.latitude}</td>
                </tr>
                <tr>
                    <th scope="row">Zoom</th>
                    <td>{props.zoom}</td>
                </tr>
            </tbody>
        </table>
    );
}
//#endregion

//#region Helper functions

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

//#endregion
