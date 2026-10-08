"use client";

import * as React from "react";
import MapGL, { Layer, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SalesMapPoint } from "@/lib/types";

// Next's bundler cannot locate MapLibre's module worker on its own, so it is
// served as a static file. public/maplibre-gl-worker.mjs MUST be the same
// version as the pinned maplibre-gl in package.json — copy it again from
// node_modules/maplibre-gl/dist/ whenever that package is upgraded.
const WORKER_URL = "/maplibre-gl-worker.mjs";

/** Loads MapLibre and points it at the static worker before the first map is created. */
function loadMapLib() {
  return import("maplibre-gl").then((m) => {
    m.setWorkerUrl(WORKER_URL);
    return m;
  });
}

// Free vector tiles, no API key. Attribution is rendered by the map itself.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Dolenjska box, used for the first view. */
const START_BOUNDS: [[number, number], [number, number]] = [
  [14.7, 45.55],
  [15.55, 46.15],
];

/** MapLibre paints need real colour strings, so read the design tokens at runtime. */
function readColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string) => css.getPropertyValue(name).trim();
  return {
    client: get("--color-good"),
    prospect: get("--color-wine"),
    open: get("--color-ink-muted"),
    review: get("--color-warn"),
    ink: get("--color-ink"),
    surface: get("--color-surface"),
  };
}

export default function SalesMap({
  points,
  onSelect,
}: {
  points: SalesMapPoint[];
  onSelect: (p: SalesMapPoint) => void;
}) {
  const mapRef = React.useRef<MapRef>(null);
  const mapLib = React.useMemo(() => loadMapLib(), []);
  const [colors, setColors] = React.useState<ReturnType<typeof readColors> | null>(null);
  React.useEffect(() => setColors(readColors()), []);

  // When filters/search change, zoom to what is left (the first render keeps the Dolenjska view).
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map || points.length === 0) return;
    const lngs = points.map((p) => p.lng);
    const lats = points.map((p) => p.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: 15, duration: 600 },
    );
  }, [points]);

  const byId = React.useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const geojson = React.useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          source: p.source,
          status: p.status,
          review: p.needsReview ? 1 : 0,
        },
      })),
    }),
    [points],
  );

  const onClick = React.useCallback(
    async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const map = mapRef.current?.getMap();
      if (!f || !map) return;

      if (f.layer.id === "clusters") {
        const src = map.getSource("venues") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 });
        return;
      }
      const p = byId.get(f.properties.id as string);
      if (p) onSelect(p);
    },
    [byId, onSelect],
  );

  if (!colors) return null;

  return (
    <MapGL
      ref={mapRef}
      mapLib={mapLib}
      mapStyle={STYLE_URL}
      initialViewState={{ bounds: START_BOUNDS, fitBoundsOptions: { padding: 24 } }}
      interactiveLayerIds={["clusters", "points"]}
      onClick={onClick}
      onMouseEnter={(e) => e.target.getCanvas().style.setProperty("cursor", "pointer")}
      onMouseLeave={(e) => e.target.getCanvas().style.removeProperty("cursor")}
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="venues" type="geojson" data={geojson} cluster clusterMaxZoom={13} clusterRadius={44}>
        <Layer
          id="clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": colors.ink,
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24],
            "circle-stroke-width": 2,
            "circle-stroke-color": colors.surface,
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12,
            "text-allow-overlap": true,
          }}
          paint={{ "text-color": colors.surface }}
        />
        <Layer
          id="review-ring"
          type="circle"
          filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "review"], 1]]}
          paint={{
            "circle-radius": 12,
            "circle-color": colors.review,
            "circle-opacity": 0.18,
            "circle-stroke-width": 2,
            "circle-stroke-color": colors.review,
          }}
        />
        <Layer
          id="points"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": [
              "match",
              ["get", "status"],
              "client",
              colors.client,
              "prospect",
              colors.prospect,
              colors.open,
            ],
            "circle-radius": ["case", ["==", ["get", "source"], "customer"], 5, 7.5],
            "circle-stroke-width": 2,
            "circle-stroke-color": colors.surface,
          }}
        />
      </Source>
    </MapGL>
  );
}
