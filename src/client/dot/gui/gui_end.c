#include "../common/spun.h"
#include "gui.h"

// Every way out of GUI mode, also before an error is printed, so that it shows on BASIC's own screen
void gui_end(void) {
    if(tilemapBackup) gui_close();
    ula_restore();
}
