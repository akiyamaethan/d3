// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

// ------------------- Basic UI Setup -------------------
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// ------------------- Game Parameters -------------------
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 3; // Nearby cells to show values
const CACHE_SPAWN_PROBABILITY = 0.1;

// ------------------- Map Setup -------------------
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).bindTooltip(
  "That's you!",
);
playerMarker.addTo(map);

let playerPoints = 0;
statusPanelDiv.innerHTML = "No points yet...";

// ------------------- Token Definitions -------------------
type Token = {
  value: number;
  i: number;
  j: number;
};
const tokensMap = new Map<string, Token>();

function getTokenForCell(i: number, j: number): Token | null {
  const key = `${i},${j}`;
  if (tokensMap.has(key)) return tokensMap.get(key)!;

  const spawnChance = luck([i, j, "initialValue"].toString());
  if (spawnChance < CACHE_SPAWN_PROBABILITY) {
    const value = 1 << Math.floor(luck([i, j, "tokenValue"].toString()) * 4);
    const token: Token = { value, i, j };
    tokensMap.set(key, token);
    return token;
  }
  return null;
}

// ------------------- Dynamic Grid Rendering -------------------
const cellLayers = new Map<string, leaflet.Layer>();

function renderGrid() {
  const bounds = map.getBounds();
  const minI = Math.floor(
    (bounds.getSouth() - CLASSROOM_LATLNG.lat) / TILE_DEGREES,
  );
  const maxI = Math.ceil(
    (bounds.getNorth() - CLASSROOM_LATLNG.lat) / TILE_DEGREES,
  );
  const minJ = Math.floor(
    (bounds.getWest() - CLASSROOM_LATLNG.lng) / TILE_DEGREES,
  );
  const maxJ = Math.ceil(
    (bounds.getEast() - CLASSROOM_LATLNG.lng) / TILE_DEGREES,
  );

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const key = `${i},${j}`;
      if (cellLayers.has(key)) continue; // Already rendered

      const cellBounds = leaflet.latLngBounds([
        [
          CLASSROOM_LATLNG.lat + i * TILE_DEGREES,
          CLASSROOM_LATLNG.lng + j * TILE_DEGREES,
        ],
        [
          CLASSROOM_LATLNG.lat + (i + 1) * TILE_DEGREES,
          CLASSROOM_LATLNG.lng + (j + 1) * TILE_DEGREES,
        ],
      ]);

      const rect = leaflet.rectangle(cellBounds, {
        color: "#3388ff",
        weight: 1,
      }).addTo(map);

      // Determine token for this cell
      const token = getTokenForCell(i, j);

      // Compute distance to player in grid cells
      const distance = Math.max(Math.abs(i), Math.abs(j));

      // Show token value if within NEIGHBORHOOD_SIZE
      if (token && distance <= NEIGHBORHOOD_SIZE) {
        const _valueMarker = leaflet.marker(
          [
            CLASSROOM_LATLNG.lat + (i + 0.5) * TILE_DEGREES,
            CLASSROOM_LATLNG.lng + (j + 0.5) * TILE_DEGREES,
          ],
          {
            icon: leaflet.divIcon({
              className: "token-value",
              html:
                `<div style="text-align:center;font-weight:bold;color:black;">${token.value}</div>`,
              iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
            }),
            interactive: false,
          },
        ).addTo(map);
      }

      // Add popup for collection
      rect.bindPopup(() => {
        const popupDiv = document.createElement("div");
        if (token && distance <= NEIGHBORHOOD_SIZE) {
          popupDiv.innerHTML = `
            <div>Token at "${i},${j}" value <span id="value">${token.value}</span></div>
            <button id="collect">Collect</button>
          `;
          popupDiv.querySelector<HTMLButtonElement>("#collect")!
            .addEventListener("click", () => {
              tokensMap.delete(key);
              playerPoints += token.value;
              statusPanelDiv.innerHTML = `${playerPoints} points accumulated`;
              popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
                "0";
            });
        } else {
          popupDiv.innerHTML = "<div>No token or too far to interact.</div>";
        }
        return popupDiv;
      });

      cellLayers.set(key, rect);
    }
  }
}

// Initial render
renderGrid();

// Update grid on map move/pan
map.on("moveend", () => {
  renderGrid();
});
