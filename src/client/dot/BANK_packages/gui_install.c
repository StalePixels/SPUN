#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "install.h"

// The latest release is asked for again: the app page drawn since install_check has changed serial
// and version. installDir is the app's own or the one chosen in the browser
unsigned char *gui_install(char *id) {
    unsigned char *error;
    unsigned char result;

    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))latest, id))) return error;
    check_install_drive();
    if((result = install(id))) return unzipErrors[result - 1];
    return NULL;
}
