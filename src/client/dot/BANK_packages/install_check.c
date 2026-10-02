#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "../gui/gui.h"
#include "catalogue.h"
#include "install.h"

unsigned char *install_check(char *id) {
    unsigned char *error;

    check_catalogue(id);
    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))latest, id))) return error;

    installCase = INSTALL_NEW;
    if(!installed) return NULL;
    if(installedSerial > serial) return err_installed_newer;
    installCase = installedSerial == serial ? INSTALL_AGAIN : INSTALL_UPDATE;
    return NULL;
}
