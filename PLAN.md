# D3: 2048 GO

-D3A
PHASE 1: MAP
[X] Initialize map centered on player's location
[X] Set appropriate zoom (should be able to see multiple cells)
[X] Define fixed grid cell size
[X] Generate visible grid cells based on viewport (dynamically)
[X] Overlay grid boundaries as leaflet layers
[X] Allow player to pan leaflet map across whole world (assert grid cells are calculated for any region panned to)

PHASE 2: TOKEN CONSISTENCY
[X] Use luck() to ensure same cells always produce same initial tokens
[X] Define spawn probability and token value rules
[X] Ensure persistence (initial cells should match across browser sessions)
[X] Display token value inside each cell via text
[X] Ensure token text is visible in cells without interaction

PHASE 3: PLAYER INTERACTION (proximity interaction)
[] Use player location as center point
[] Determine whether cell is within interaction radius (3 cells) of center point
[] Visually distinguish interactable cells by highlighting them yellow and leaving the other cells as they are
[] Dynamically update visible interactable cells when player moves
[] Ensure distant cells cannot be interacted with
