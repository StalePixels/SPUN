#include "../common/spun.h"
#include "../../unzip/inflate.h"
#include "gui.h"

// After im2_off: IDE_BANK is a NextZXOS call
void gui_free(void) {
    uint8_t count;

    unzip_pages_release();
    if(tilemapBackup) esx_ide_bank_free(0, tilemapBackup);
    tilemapBackup = 0;
    if(!layer2Page) return;
    for(count = 0; count != LAYER2_PAGES; count++) esx_ide_bank_free(0, layer2Page + count);
    layer2Page = 0;
}
