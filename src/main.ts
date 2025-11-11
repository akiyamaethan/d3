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
const NEIGHBORHOOD_SIZE = 3; // Nearby cells that can be interacted with / show token values
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

statusPanelDiv.innerHTML = "No points yet...";

// ------------------- Inventory -------------------
let heldToken: Token | null = null;

const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventoryPanel";
inventoryDiv.style.marginTop = "10px";
inventoryDiv.style.fontWeight = "bold";
inventoryDiv.innerText = "Holding: None";
controlPanelDiv.appendChild(inventoryDiv);

function updateInventoryUI() {
  inventoryDiv.innerText = heldToken
    ? `Holding: ${heldToken.value}`
    : "Holding: None";
}

// ------------------- Token Definitions -------------------
type Token = {
  value: number;
  i: number;
  j: number;
};

const tokensMap = new Map<string, Token>();
const valueMarkers = new Map<string, leaflet.Marker>();
const cellLayers = new Map<string, leaflet.Layer>();

// ------------------- Spawn initial deterministic tokens -------------------
for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
    const spawnChance = luck([i, j, "initialValue"].toString());
    if (spawnChance < CACHE_SPAWN_PROBABILITY) {
      const token: Token = {
        value: 1 << Math.floor(luck([i, j, "tokenValue"].toString()) * 4), // 1,2,4,8
        i,
        j,
      };
      tokensMap.set(`${i},${j}`, token);
    }
  }
}

// ------------------- Token Utilities -------------------
function getTokenForCell(i: number, j: number): Token | null {
  const key = `${i},${j}`;
  return tokensMap.get(key) ?? null; // Do not regenerate once removed
}

// ------------------- Render Grid -------------------
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
      const distance = Math.max(Math.abs(i), Math.abs(j));
      const color = distance <= NEIGHBORHOOD_SIZE ? "yellow" : "#3388ff";

      // Get or create rectangle
      let rect: leaflet.Rectangle;
      if (cellLayers.has(key)) {
        rect = cellLayers.get(key)! as leaflet.Rectangle;
        rect.setStyle({ color });
      } else {
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
        rect = leaflet.rectangle(cellBounds, { color, weight: 1 }).addTo(map);
        cellLayers.set(key, rect);

        rect.bindPopup(() => {
          const popupDiv = document.createElement("div");
          const token = getTokenForCell(i, j);

          if (distance > NEIGHBORHOOD_SIZE) {
            popupDiv.innerHTML =
              "<div>Too far to interact with this token.</div>";
            return popupDiv;
          }

          // ------------------- Collect -------------------
          if (token && !heldToken) {
            popupDiv.innerHTML = `
              <div>Token at "${i},${j}" value <span id="value">${token.value}</span></div>
              <button id="collect">Collect</button>
            `;
            popupDiv.querySelector<HTMLButtonElement>("#collect")!
              .addEventListener("click", () => {
                tokensMap.delete(key);
                if (valueMarkers.has(key)) {
                  map.removeLayer(valueMarkers.get(key)!);
                  valueMarkers.delete(key);
                }

                heldToken = token;
                updateInventoryUI();

                rect.closePopup();
                renderGrid();
              });

            // ------------------- Craft -------------------
          } else if (heldToken) {
            if (token && token.value === heldToken.value) {
              popupDiv.innerHTML = `
                <div>Token at "${i},${j}" value ${token.value}. Place your token to craft!</div>
                <button id="craft">Craft</button>
              `;
              popupDiv.querySelector<HTMLButtonElement>("#craft")!
                .addEventListener("click", () => {
                  // Merge tokens to create new token of double value
                  const newValue = token.value * 2;
                  const craftedToken: Token = { value: newValue, i, j };
                  tokensMap.set(key, craftedToken as Token);

                  // Update value marker immediately
                  if (valueMarkers.has(key)) {
                    map.removeLayer(valueMarkers.get(key)!);
                    valueMarkers.delete(key);
                  }
                  const valueMarker = leaflet.marker(
                    [
                      CLASSROOM_LATLNG.lat + (i + 0.5) * TILE_DEGREES,
                      CLASSROOM_LATLNG.lng + (j + 0.5) * TILE_DEGREES,
                    ],
                    {
                      icon: leaflet.divIcon({
                        className: "token-value",
                        html:
                          `<div style="text-align:center;font-weight:bold;color:black;">${craftedToken.value}</div>`,
                        iconSize: [
                          TILE_DEGREES * 100000,
                          TILE_DEGREES * 100000,
                        ],
                      }),
                      interactive: false,
                    },
                  ).addTo(map);
                  valueMarkers.set(key, valueMarker);

                  heldToken = null;
                  updateInventoryUI();

                  rect.closePopup();
                });

              // ------------------- Place on empty cell -------------------
            } else if (!token) {
              popupDiv.innerHTML = `
                <div>Place your held token of value ${heldToken.value} here.</div>
                <button id="place">Place</button>
              `;
              popupDiv.querySelector<HTMLButtonElement>("#place")!
                .addEventListener("click", () => {
                  const placedToken: Token = { value: heldToken!.value, i, j };
                  tokensMap.set(key, placedToken as Token);

                  // Update value marker immediately
                  if (valueMarkers.has(key)) {
                    map.removeLayer(valueMarkers.get(key)!);
                    valueMarkers.delete(key);
                  }
                  const valueMarker = leaflet.marker(
                    [
                      CLASSROOM_LATLNG.lat + (i + 0.5) * TILE_DEGREES,
                      CLASSROOM_LATLNG.lng + (j + 0.5) * TILE_DEGREES,
                    ],
                    {
                      icon: leaflet.divIcon({
                        className: "token-value",
                        html:
                          `<div style="text-align:center;font-weight:bold;color:black;">${placedToken.value}</div>`,
                        iconSize: [
                          TILE_DEGREES * 100000,
                          TILE_DEGREES * 100000,
                        ],
                      }),
                      interactive: false,
                    },
                  ).addTo(map);
                  valueMarkers.set(key, valueMarker);

                  heldToken = null;
                  updateInventoryUI();

                  rect.closePopup();
                });
            } else {
              popupDiv.innerHTML =
                `<div>Token at "${i},${j}" value ${token.value}. You are holding a token (${heldToken.value}).</div>`;
            }
          } else {
            popupDiv.innerHTML =
              `<div>No token here. You are holding nothing.</div>`;
          }

          return popupDiv;
        });
      }

      // ------------------- Value markers -------------------
      const token = getTokenForCell(i, j);
      if (token && distance <= NEIGHBORHOOD_SIZE && !valueMarkers.has(key)) {
        const valueMarker = leaflet.marker(
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
        valueMarkers.set(key, valueMarker);
      } else if (
        (!token || distance > NEIGHBORHOOD_SIZE) && valueMarkers.has(key)
      ) {
        map.removeLayer(valueMarkers.get(key)!);
        valueMarkers.delete(key);
      }
    }
  }
}

// Initial render
renderGrid();

// Re-render grid when map is panned
map.on("moveend", () => {
  renderGrid();
});
