#include "../common/spun.h"
#include "gui.h"

bool tilemapIn;

// Tile definitions 32-255 (0-31 would be the system variables) and the 80x32 map (NR 0x6F, 0x6E)
static const struct bank5_area tileAreas[TILE_AREAS] = { { 0x5D00, 224 * 8 }, { 0x6C00, GUI_COLUMNS * GUI_ROWS * 2 } };

bool tiles_give(void) {
    if(!tilemapIn) return false;
    tilemapIn = false;
    bank5_move(tileAreas, TILE_AREAS, tilemapBackup, BANK5_SWAP);
    return true;
}

void tiles_take(void) {
    bank5_move(tileAreas, TILE_AREAS, tilemapBackup, BANK5_SWAP);
    tilemapIn = true;
}
