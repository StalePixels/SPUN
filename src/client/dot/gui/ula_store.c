#include "../common/spun.h"
#include "gui.h"

uint8_t ulaBackup;

// BASIC's screen and the system variables its next PRINT uses: both print positions, the scroll
// count, the colours, TV_FLAG, DF_SZ and BORDCR. The browser draws over the screen
const struct bank5_area ulaAreas[ULA_AREAS] = {
    { 0x4000, 6912 }, { 0x5C3C, 1 }, { 0x5C48, 1 }, { 0x5C6B, 1 }, { 0x5C84, 14 },
};

void ula_store(void) {
    ulaBackup = esx_ide_bank_alloc(0);
    if(ulaBackup == 0xFF) {
        ulaBackup = 0;
        NBN_Fail(err_no_memory);
    }
    bank5_move(ulaAreas, ULA_AREAS, ulaBackup, BANK5_SAVE);
}
