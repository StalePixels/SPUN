#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "../gui/gui.h"
#include "catalogue.h"
#include "install.h"

unsigned char *install_check(char *id) {
    unsigned char *error;

    install_start();
    check_catalogue(id);
    if((error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, id))) return error;
    if((error = core_check(title, minCore))) return error;

    installCase = INSTALL_NEW;
    if(installed) {
        if(installedSerial > serial) return err_installed_newer;
        installCase = installedSerial == serial ? INSTALL_AGAIN : INSTALL_UPDATE;
    }
    return deps_check();
}
