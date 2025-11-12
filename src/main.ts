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
const NEIGHBORHOOD_SIZE = 3;
const CACHE_SPAWN_PROBABILITY = 0.1;

// ------------------- Map Setup -------------------
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: true,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// ------------------- Player -------------------
let playerLat = CLASSROOM_LATLNG.lat;
let playerLng = CLASSROOM_LATLNG.lng;
const playerMarker = leaflet.marker([playerLat, playerLng]).bindTooltip(
  "That's you!",
);
playerMarker.addTo(map);
statusPanelDiv.innerHTML = "No points yet...";

function updatePlayerMarker() {
  playerMarker.setLatLng([playerLat, playerLng]);
  map.setView([playerLat, playerLng]);
  renderGrid();
}

// ------------------- Inventory -------------------
type Token = { value: number; i: number; j: number };
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

// ------------------- Data Maps -------------------
const tokensMap = new Map<string, Token>();
const valueMarkers = new Map<string, leaflet.Marker>();
const cellLayers = new Map<string, leaflet.Layer>();

// ------------------- Token Retrieval -------------------
function getTokenForCell(i: number, j: number): Token | null {
  const key = cellKey(i, j);
  if (tokensMap.has(key)) return tokensMap.get(key)!;

  // Deterministic spawn chance based on global coordinates
  const spawnChance = luck(`${i},${j},spawn`);
  if (spawnChance < CACHE_SPAWN_PROBABILITY) {
    const value = 1 << Math.floor(luck(`${i},${j},value`) * 4); // 1, 2, 4, or 8
    const token: Token = { value, i, j };
    tokensMap.set(key, token);
    return token;
  }
  return null;
}

// --- Grid conversion helpers ---
function latLngToCell(lat: number, lng: number) {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}
function cellKey(i: number, j: number) {
  return `${i},${j}`;
}
function cellCenter(i: number, j: number) {
  return [
    (i + 0.5) * TILE_DEGREES,
    (j + 0.5) * TILE_DEGREES,
  ] as [number, number];
}
function cellToBounds(i: number, j: number) {
  return leaflet.latLngBounds(
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  );
}
// ------------------- Render Grid -------------------
function renderGrid() {
  const playerCell = latLngToCell(playerLat, playerLng);

  const bounds = map.getBounds();
  const minI = Math.floor(bounds.getSouth() / TILE_DEGREES);
  const maxI = Math.ceil(bounds.getNorth() / TILE_DEGREES);
  const minJ = Math.floor(bounds.getWest() / TILE_DEGREES);
  const maxJ = Math.ceil(bounds.getEast() / TILE_DEGREES);

  // Remove value markers that drift out of range
  for (const [key, marker] of valueMarkers.entries()) {
    const [i, j] = key.split(",").map(Number);
    const distance = Math.max(
      Math.abs(i - playerCell.i),
      Math.abs(j - playerCell.j),
    );
    if (distance > NEIGHBORHOOD_SIZE) {
      map.removeLayer(marker);
      valueMarkers.delete(key);
    }
  }

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const key = cellKey(i, j);
      const distance = Math.max(
        Math.abs(i - playerCell.i),
        Math.abs(j - playerCell.j),
      );
      const color = distance <= NEIGHBORHOOD_SIZE ? "yellow" : "#3388ff";
      const token = getTokenForCell(i, j);

      // Create or update rectangle
      let rect: leaflet.Rectangle;
      if (!cellLayers.has(key)) {
        rect = leaflet.rectangle(cellToBounds(i, j), { color, weight: 1 })
          .addTo(map);
        cellLayers.set(key, rect);
      } else {
        rect = cellLayers.get(key)! as leaflet.Rectangle;
        rect.setStyle({ color });
      }

      // Always refresh popup binding (so interactions are up-to-date)
      rect.bindPopup(() => {
        const popupDiv = document.createElement("div");

        if (distance > NEIGHBORHOOD_SIZE) {
          popupDiv.innerHTML = "<div>Too far to interact with this cell.</div>";
          return popupDiv;
        }

        if (token && !heldToken) {
          popupDiv.innerHTML = `
            <div>Token ${token.value}</div>
            <button id="collect">Collect</button>
          `;
          popupDiv.querySelector("#collect")!.addEventListener("click", () => {
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
        } else if (heldToken) {
          if (token && token.value === heldToken.value) {
            popupDiv.innerHTML = `
              <div>Token ${token.value} — craft?</div>
              <button id="craft">Craft</button>
            `;
            popupDiv.querySelector("#craft")!.addEventListener("click", () => {
              const newValue = token.value * 2;
              const newToken: Token = { value: newValue, i, j };
              tokensMap.set(key, newToken);
              heldToken = null;
              updateInventoryUI();

              if (valueMarkers.has(key)) {
                map.removeLayer(valueMarkers.get(key)!);
                valueMarkers.delete(key);
              }
              const marker = leaflet.marker(cellCenter(i, j), {
                icon: leaflet.divIcon({
                  className: "token-value",
                  html:
                    `<div style="font-weight:bold;color:black;">${newToken.value}</div>`,
                  iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
                }),
                interactive: false,
              }).addTo(map);
              valueMarkers.set(key, marker);
              rect.closePopup();
              renderGrid();
            });
          } else if (!token) {
            popupDiv.innerHTML = `
              <div>Empty cell — place ${heldToken.value}?</div>
              <button id="place">Place</button>
            `;
            popupDiv.querySelector("#place")!.addEventListener("click", () => {
              const newToken: Token = { value: heldToken!.value, i, j };
              tokensMap.set(key, newToken);
              heldToken = null;
              updateInventoryUI();

              const marker = leaflet.marker(cellCenter(i, j), {
                icon: leaflet.divIcon({
                  className: "token-value",
                  html:
                    `<div style="font-weight:bold;color:black;">${newToken.value}</div>`,
                  iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
                }),
                interactive: false,
              }).addTo(map);
              valueMarkers.set(key, marker);
              rect.closePopup();
              renderGrid();
            });
          } else {
            popupDiv.innerHTML =
              `<div>Token ${token.value}. You hold ${heldToken.value}.</div>`;
          }
        } else {
          popupDiv.innerHTML = `<div>No token here.</div>`;
        }

        return popupDiv;
      });

      // Refresh token value markers (even for existing rectangles)
      if (token && distance <= NEIGHBORHOOD_SIZE) {
        if (!valueMarkers.has(key)) {
          const marker = leaflet.marker(cellCenter(i, j), {
            icon: leaflet.divIcon({
              className: "token-value",
              html:
                `<div style="font-weight:bold;color:black;">${token.value}</div>`,
              iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
            }),
            interactive: false,
          }).addTo(map);
          valueMarkers.set(key, marker);
        }
      }
    }
  }
}

// ------------------- Movement Controls -------------------
const moveDiv = document.createElement("div");
moveDiv.innerHTML = `
  <button id="north">↑</button><br/>
  <button id="west">←</button>
  <button id="south">↓</button>
  <button id="east">→</button>
`;
controlPanelDiv.appendChild(moveDiv);

function movePlayer(di: number, dj: number) {
  playerLat += di * TILE_DEGREES;
  playerLng += dj * TILE_DEGREES;
  updatePlayerMarker();
}

document.getElementById("north")!.addEventListener(
  "click",
  () => movePlayer(1, 0),
);
document.getElementById("south")!.addEventListener(
  "click",
  () => movePlayer(-1, 0),
);
document.getElementById("west")!.addEventListener(
  "click",
  () => movePlayer(0, -1),
);
document.getElementById("east")!.addEventListener(
  "click",
  () => movePlayer(0, 1),
);

globalThis.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "w":
    case "arrowup":
      movePlayer(1, 0);
      break;
    case "s":
    case "arrowdown":
      movePlayer(-1, 0);
      break;
    case "a":
    case "arrowleft":
      movePlayer(0, -1);
      break;
    case "d":
    case "arrowright":
      movePlayer(0, 1);
      break;
  }
});

// ------------------- Deterministic Token Initialization -------------------
for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
    const spawnChance = luck([i, j, "initialValue"].toString());
    if (spawnChance < CACHE_SPAWN_PROBABILITY) {
      const token: Token = {
        value: 1 << Math.floor(luck([i, j, "tokenValue"].toString()) * 4),
        i,
        j,
      };
      tokensMap.set(cellKey(i, j), token);
    }
  }
}

// Initial render
renderGrid();
map.on("moveend", renderGrid);
