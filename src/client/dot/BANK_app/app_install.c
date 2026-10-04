#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_packages/install.h"
#include "app.h"

static const struct gui_button confirmButtons[] = {
    { MODAL_COL + 2, MODAL_BUTTON_ROW, 'i', "Install" },
    { MODAL_COL + 13, MODAL_BUTTON_ROW, 'c', "Cancel" },
};

static const struct gui_button suggestButtons[] = {
    { MODAL_COL + 2, MODAL_BUTTON_ROW, 'y', "Yes" },
    { MODAL_COL + 9, MODAL_BUTTON_ROW, 'n', "No" },
};

// The NextZXOS browser cannot tell SPACE from BREAK, so the choice is confirmed. It draws its
// own screen and leaves the tilemap empty, so the title and the page are drawn again
void app_install(void) {
    unsigned char head[GUI_COLUMNS];
    unsigned char latestVersion[sizeof(version)];
    unsigned char *lines[3];
    unsigned char *error;
    bool suggested = false;

    error = os_call(BANK_PACKAGES, (void *(*)(void *))install_check, appid);
    strcpy(latestVersion, version);
    sprintf(head, "Install %s %s to:", title, latestVersion);
    lines[0] = head;
    lines[1] = installDir;
    lines[2] = (unsigned char *)"";
    if(!error && installCase == INSTALL_NEW && *suggestDir) {
        sprintf(installDir, "C:%s", suggestDir);
        suggested = modal_ask(lines, 3, suggestButtons, 2) == 0;
    }
    if(!error && installCase == INSTALL_NEW && !suggested) {
        while(in_test_key()) intrinsic_halt();
        gui_suspend();
        choose_dir();
        gui_resume();
    }
    title_draw();
    app_show(false);
    if(error) {
        message_show(error);
        return;
    }

    if(suggested) {
        error = os_call(BANK_PACKAGES, (void *(*)(void *))dir_make, NULL);
    } else if(installCase != INSTALL_UPDATE) {
        if(installCase == INSTALL_AGAIN) {
            sprintf(head, "%s %s is installed in:", title, latestVersion);
            lines[2] = (unsigned char *)"Install it again?";
        }
        if(modal_ask(lines, 3, confirmButtons, 2) != 0) {
            app_show(false);
            return;
        }
    }

    if(!error) error = os_call(BANK_PACKAGES, (void *(*)(void *))gui_install, appid);
    app_show(false);
    if(error) {
        message_show(error);
        return;
    }
    tm_text(1, STATUS_ROW, (unsigned char *)"Installed to", ATTR_TEXT);
    tm_cut(14, STATUS_ROW, installDir, GUI_COLUMNS - 15, ATTR_TEXT);
}
