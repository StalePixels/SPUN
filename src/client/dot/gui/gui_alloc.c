#include "../common/spun.h"
#include "../../unzip/inflate.h"
#include "gui.h"

uint8_t tilemapBackup;
uint8_t layer2Page;

// Before im2_on: IDE_BANK is a NextZXOS call. The unzip's pages are allocated here, so that an
// install makes no IDE_BANK call while the GUI holds bank 5's tile area. On a failure nothing stays allocated
void gui_alloc(void) {
    tilemapBackup = esx_ide_bank_alloc(0);
    if(tilemapBackup == 0xFF) {
        tilemapBackup = 0;
        NBN_Fail(err_no_memory);
    }
    if(!layer2_reserve()) {
        gui_free();
        NBN_Fail(err_no_layer_ram);
    }
    if(!unzip_pages_keep()) {
        gui_free();
        NBN_Fail(err_no_memory);
    }
}
