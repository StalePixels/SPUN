#include "../common/spun.h"
#include "../BANK_gui/run.h"
#include "catalogue.h"
#include "install.h"

unsigned char *rows_installed(void) {
    uint8_t index;

    memset(rowInstalled, 0, sizeof(rowInstalled));
    if(!open_in(catalogue)) return NULL;
    while(next_line()) {
        if(!parse_entry()) continue;
        for(index = 0; index != LIST_ROWS; index++) {
            if(strcmp(rowApps[index], entryApp) == 0) rowInstalled[index] = true;
        }
    }
    close_in();
    return NULL;
}
