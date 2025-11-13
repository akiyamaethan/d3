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
const START_LAT = 36.997936938057016;
const START_LNG = -122.05703507501151;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 3;
const CACHE_SPAWN_PROBABILITY = 0.1;
const GAMEPLAY_ZOOM_LEVEL = 19;
const WIN_THRESHOLD = 64;

// ------------------- Map Setup -------------------
const map = leaflet.map(mapDiv, {
  center: [START_LAT, START_LNG],
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

// ------------------- Player -------------------
let playerLat = START_LAT;
let playerLng = START_LNG;

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

// ------------------- Logical Grid Cells -------------------
type GridCell = {
  i: number;
  j: number;
  token: Token | null;
};

const cellsMap = new Map<string, GridCell>();
const cellLayers = new Map<string, leaflet.Rectangle>();
const valueMarkers = new Map<string, leaflet.Marker>();

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

function cellCenter(i: number, j: number): [number, number] {
  return [(i + 0.5) * TILE_DEGREES, (j + 0.5) * TILE_DEGREES];
}

function cellToBounds(i: number, j: number) {
  return leaflet.latLngBounds(
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  );
}

function latLngToCell(lat: number, lng: number) {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function getOrCreateCell(i: number, j: number): GridCell {
  const key = cellKey(i, j);
  if (cellsMap.has(key)) return cellsMap.get(key)!;

  const token = (() => {
    const spawnChance = luck(`${i},${j},spawn`);
    if (spawnChance < CACHE_SPAWN_PROBABILITY) {
      return { value: 1 << Math.floor(luck(`${i},${j},value`) * 4), i, j };
    }
    return null;
  })();

  const cell: GridCell = { i, j, token };
  cellsMap.set(key, cell);
  return cell;
}

// ------------------- Victory UI -------------------
let hasWon = false;
const winOverlay = document.createElement("div");
winOverlay.id = "winOverlay";
winOverlay.style.position = "fixed";
winOverlay.style.top = "0";
winOverlay.style.left = "0";
winOverlay.style.width = "100%";
winOverlay.style.height = "100%";
winOverlay.style.display = "none"; // start hidden
winOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
winOverlay.style.color = "white";
winOverlay.style.fontSize = "48px";
winOverlay.style.fontWeight = "bold";
winOverlay.style.justifyContent = "center";
winOverlay.style.alignItems = "center";
winOverlay.style.flexDirection = "column";
winOverlay.style.zIndex = "9999";
winOverlay.style.textAlign = "center";

const winText = document.createElement("div");
winText.innerText = "🎉 You Win! 🎉";
winOverlay.appendChild(winText);

const resetButton = document.createElement("button");
resetButton.innerText = "Play Again";
resetButton.style.marginTop = "20px";
resetButton.style.fontSize = "24px";
resetButton.addEventListener("click", resetGame);
winOverlay.appendChild(resetButton);

document.body.appendChild(winOverlay);

function declareVictory() {
  hasWon = true;
  winOverlay.style.display = "flex";
}

function resetGame() {
  hasWon = false;
  winOverlay.style.display = "none";
  heldToken = null;
  updateInventoryUI();
  // clear logical and visual maps
  cellsMap.clear();
  // remove rectangle and marker layers we created (keep base tile layer)
  for (const [k, rect] of cellLayers.entries()) {
    if (map.hasLayer(rect)) map.removeLayer(rect);
    cellLayers.delete(k);
  }
  for (const [k, marker] of valueMarkers.entries()) {
    if (map.hasLayer(marker)) map.removeLayer(marker);
    valueMarkers.delete(k);
  }

  // Move player back to start
  playerLat = START_LAT;
  playerLng = START_LNG;
  playerMarker.addTo(map);
  renderGrid();
}

// ------------------- Core interaction: click handler helper -------------------
function handleCellClick(i: number, j: number) {
  if (hasWon) return;
  const playerCell = latLngToCell(playerLat, playerLng);
  const distance = Math.max(
    Math.abs(i - playerCell.i),
    Math.abs(j - playerCell.j),
  );
  if (distance > NEIGHBORHOOD_SIZE) {
    // out of range: do nothing
    return;
  }

  const key = cellKey(i, j);
  const cell = getOrCreateCell(i, j);

  // If there's a token in the cell
  if (cell.token) {
    // Inventory empty -> pick up
    if (!heldToken) {
      heldToken = cell.token;
      cell.token = null;
      // remove marker if shown
      if (valueMarkers.has(key)) {
        if (map.hasLayer(valueMarkers.get(key)!)) {
          map.removeLayer(valueMarkers.get(key)!);
        }
        valueMarkers.delete(key);
      }
      updateInventoryUI();
      renderGrid();
      return;
    }

    // Inventory full -> attempt craft if same value
    if (heldToken.value === cell.token.value) {
      // craft: double value on cell, clear inventory
      const newValue = cell.token.value * 2;
      cell.token = { value: newValue, i, j };
      heldToken = null;
      updateInventoryUI();

      // update/remove old marker and add new one
      if (valueMarkers.has(key)) {
        if (map.hasLayer(valueMarkers.get(key)!)) {
          map.removeLayer(valueMarkers.get(key)!);
        }
        valueMarkers.delete(key);
      }
      const marker = leaflet.marker(cellCenter(i, j), {
        icon: leaflet.divIcon({
          className: "token-value",
          html:
            `<div style="font-weight:bold;color:black;">${cell.token.value}</div>`,
          iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
        }),
        interactive: false,
      }).addTo(map);
      valueMarkers.set(key, marker);

      renderGrid();

      // Victory check
      if (cell.token.value >= WIN_THRESHOLD) {
        declareVictory();
      }
      return;
    }

    // Inventory full and different value -> do nothing
    return;
  }

  // Cell empty
  if (!cell.token && heldToken) {
    // place held token here
    cell.token = { value: heldToken.value, i, j };
    heldToken = null;
    updateInventoryUI();

    // create marker
    if (valueMarkers.has(key)) {
      if (map.hasLayer(valueMarkers.get(key)!)) {
        map.removeLayer(valueMarkers.get(key)!);
      }
      valueMarkers.delete(key);
    }
    const marker = leaflet.marker(cellCenter(i, j), {
      icon: leaflet.divIcon({
        className: "token-value",
        html:
          `<div style="font-weight:bold;color:black;">${cell.token.value}</div>`,
        iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
      }),
      interactive: false,
    }).addTo(map);
    valueMarkers.set(key, marker);

    renderGrid();
    return;
  }

  // else empty cell and no held token -> nothing
}

// ------------------- Render Grid -------------------
function renderGrid() {
  if (hasWon) return;

  const playerCell = latLngToCell(playerLat, playerLng);

  const bounds = map.getBounds();
  const minI = Math.floor(bounds.getSouth() / TILE_DEGREES);
  const maxI = Math.ceil(bounds.getNorth() / TILE_DEGREES);
  const minJ = Math.floor(bounds.getWest() / TILE_DEGREES);
  const maxJ = Math.ceil(bounds.getEast() / TILE_DEGREES);

  // Remove off-screen layers (Phase 7: memoryless farming)
  for (const [key, layer] of Array.from(cellLayers.entries())) {
    const [i, j] = key.split(",").map(Number);
    if (i < minI || i > maxI || j < minJ || j > maxJ) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      cellLayers.delete(key);
      if (valueMarkers.has(key)) {
        if (map.hasLayer(valueMarkers.get(key)!)) {
          map.removeLayer(valueMarkers.get(key)!);
        }
        valueMarkers.delete(key);
      }
      // Forget logical cell to enable farming
      cellsMap.delete(key);
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

      const cell = getOrCreateCell(i, j);

      // Create or update rectangle
      let rect: leaflet.Rectangle;
      if (!cellLayers.has(key)) {
        rect = leaflet.rectangle(cellToBounds(i, j), { color, weight: 1 })
          .addTo(map);
        cellLayers.set(key, rect);
        // make sure click handler is bound once
        rect.on("click", () => handleCellClick(i, j));
      } else {
        rect = cellLayers.get(key)!;
        rect.setStyle({ color });
        // rebind click handler safely (prevent duplicate handlers)
        rect.off("click");
        rect.on("click", () => handleCellClick(i, j));
      }

      // Ensure there is a nearby token marker visible
      if (cell.token && distance <= NEIGHBORHOOD_SIZE) {
        if (!valueMarkers.has(key)) {
          const marker = leaflet.marker(cellCenter(i, j), {
            icon: leaflet.divIcon({
              className: "token-value",
              html:
                `<div style="font-weight:bold;color:black;">${cell.token.value}</div>`,
              iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
            }),
            interactive: false,
          }).addTo(map);
          valueMarkers.set(key, marker);
        } else {
          // update marker HTML if needed
          const existing = valueMarkers.get(key)!;
          // quick update by replacing icon (Leaflet doesn't provide setHtml on divIcon)
          if (map.hasLayer(existing)) map.removeLayer(existing);
          const marker = leaflet.marker(cellCenter(i, j), {
            icon: leaflet.divIcon({
              className: "token-value",
              html:
                `<div style="font-weight:bold;color:black;">${cell.token.value}</div>`,
              iconSize: [TILE_DEGREES * 100000, TILE_DEGREES * 100000],
            }),
            interactive: false,
          }).addTo(map);
          valueMarkers.set(key, marker);
        }
      } else {
        // no token or out of neighborhood — remove marker if exists
        if (valueMarkers.has(key)) {
          if (map.hasLayer(valueMarkers.get(key)!)) {
            map.removeLayer(valueMarkers.get(key)!);
          }
          valueMarkers.delete(key);
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
  if (hasWon) return;
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

globalThis.addEventListener("keydown", (e: KeyboardEvent) => {
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

// ------------------- Initial Render -------------------
renderGrid();
map.on("moveend", renderGrid);
