// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// === Gameplay constants (Phase 1 uses only TILE_DEGREES) ===
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;

// UI containers
const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// Leaflet map
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Player marker
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

//
// =============== PHASE 1 IMPLEMENTATION ===============
// Grid rendering across entire map viewport
//

// Convert lat/lng → grid cell indices
function latLngToCell(lat: number, lng: number) {
  const i = Math.floor((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const j = Math.floor((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
  return { i, j };
}

// Convert cell index → rectangular bounds
function cellBounds(i: number, j: number) {
  const o = CLASSROOM_LATLNG;
  return leaflet.latLngBounds([
    [o.lat + i * TILE_DEGREES, o.lng + j * TILE_DEGREES],
    [o.lat + (i + 1) * TILE_DEGREES, o.lng + (j + 1) * TILE_DEGREES],
  ]);
}

// Draw grid cells visible in current viewport
function drawVisibleGrid() {
  // Remove previous grid rectangles
  gridLayer.clearLayers();

  const bounds = map.getBounds();

  // Convert visible lat/lng edges to cell ranges
  const nw = latLngToCell(bounds.getNorth(), bounds.getWest());
  const se = latLngToCell(bounds.getSouth(), bounds.getEast());

  const iMin = Math.min(nw.i, se.i);
  const iMax = Math.max(nw.i, se.i);
  const jMin = Math.min(nw.j, se.j);
  const jMax = Math.max(nw.j, se.j);

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const rect = leaflet.rectangle(cellBounds(i, j), {
        color: "#999",
        weight: 1,
        fillOpacity: 0, // empty cells for now
      });

      // Optional: label cell coordinates
      rect.bindTooltip(`Cell ${i},${j}`);

      rect.addTo(gridLayer);
    }
  }
}

// A dedicated layer for grid rectangles
const gridLayer = leaflet.layerGroup().addTo(map);

// Draw grid initially
drawVisibleGrid();

// Redraw grid whenever the map moves
map.on("move", drawVisibleGrid);
map.on("moveend", drawVisibleGrid);
