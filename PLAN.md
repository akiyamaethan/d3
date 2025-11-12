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
[X] Use player location as center point
[X] Determine whether cell is within interaction radius (3 cells) of center point
[X] Visually distinguish interactable cells by highlighting them yellow and leaving the other cells as they are
[] Dynamically update visible interactable cells when player moves
[X] Ensure distant cells cannot be interacted with

PHASE 4: INVENTORY SYSTEM
[X] Store whether player is holding a toeken
[X] Store token value if present
[X] Display inventory state on screen
[X] When a player clicks a close enough cell, if their inventory is empty remove the token from the cell and place it in the inventory and update stored state

PHASE 5: CRAFTING
[X] When clicking a cell with a token. If the player has a token of equal value in inventory:
[X] Remove existing cell token and inventory token
[X] Generate new token in grid cell with doubled value
[X] Inventory should be empty after succesful craft

-D3B
PHASE 6: PLAYER MOVEMENT
[X] Refactor grid cells to originate from Null Island
[X] Implement functions for lat/long to grid indices
[X] Ensure token consistency again
[X] Add directional buttons (also controllable with wasd and arrow keys) for NSEW movement
[X] Update player position and recenter map after each move
[X] Maintain dynamic rendering of grid cells

PHASE 7: TOKEN REFACTOR
[] Implement grid cell data type to separate logical cells from leaflet layers
[] Ensure off-screen cells are forgotten to enable farming
[] Ensure cells are still spawning/despawning as necessary

PHASE 8: WIN CONDITION
[] Set win threshold to 64 (for testing)
[] Ensure crafting logic still functions and player can craft up to 64
[] Display "You Win" if player crafts a 64 token
[] Allow player to reset gamestate after victory
