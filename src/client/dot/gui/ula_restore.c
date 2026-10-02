#include "../common/spun.h"
#include "gui.h"

// After gui_close: IDE_BANK is a NextZXOS call
void ula_restore(void) {
    if(!ulaBackup) return;
    bank5_move(ulaAreas, ULA_AREAS, ulaBackup, BANK5_LOAD);
    esx_ide_bank_free(0, ulaBackup);
    ulaBackup = 0;
}
