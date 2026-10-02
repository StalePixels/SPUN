#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "catalogue.h"
#include "install.h"

uint16_t updates_count(void) {
    uint16_t count = 0;

    if(!open_in(catalogue)) return 0;
    while(next_line()) {
        if(!*entry || *entry == '#' || *entry == ';') continue;
        parse_entry();
        strcpy(appid, entryApp);
        if(_farWithPointer(BANK_NET, (void *(*)(void *))latest, appid)) continue;
        if(serial > entrySerial) count++;
    }
    close_in();
    return count;
}
