#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "catalogue.h"
#include "install.h"
#ifdef __ZXNEXT
#include "../gui/gui.h"
#else
#define guiOpen false
#endif

static uint16_t updates;

unsigned char *unzipErrors[] = {
    err_no_memory, err_unzip_read, err_unzip_format, err_unzip_unsupported, err_unzip_path,
    err_unzip_create, err_unzip_write, err_unzip_data, err_unzip_check, err_unzip_abort
};

#ifdef __ZXNEXT
static const struct gui_button overwriteButtons[] = {
    { MODAL_COL + 2, MODAL_BUTTON_ROW, OVERWRITE_ONCE, "Once" },
    { MODAL_COL + 10, MODAL_BUTTON_ROW, OVERWRITE_ALL, "All" },
    { MODAL_COL + 17, MODAL_BUTTON_ROW, OVERWRITE_CANCEL, "Cancel" },
};
#endif

static void print_error(unsigned char *text) __z88dk_fastcall {
    unsigned char chr;

    do {
        chr = *text++;
        putchar(chr & 0x7F);
    } while(!(chr & 0x80) && *text);
    putchar('\n');
}

// Returns the key pressed, one of keys. At the end of POSIX input it returns the last key, the safe answer
static unsigned char ask(const char *keys) __z88dk_fastcall {
    unsigned char chr;

#ifdef __ZXNEXT
    in_wait_nokey();
    do {
        chr = tolower(in_inkey());
    } while(!chr || !strchr(keys, chr));
    in_wait_nokey();
    printf("%c\n", chr);
#else
    unsigned char answer[8];

    do {
        fflush(stdout);
        if(!fgets(answer, sizeof(answer), stdin)) return keys[strlen(keys) - 1];
        chr = tolower(answer[0]);
    } while(!chr || !strchr(keys, chr));
#endif
    return chr;
}

// unzip calls it inside the GUI's os_call, with interrupts off, and the dialog waits for them
unsigned char overwrite_ask(const char *name) {
#ifdef __ZXNEXT
    unsigned char *lines[2];
    uint8_t choice;

    if(guiOpen) {
        lines[0] = (unsigned char *)"Overwrite?";
        lines[1] = (unsigned char *)name;
        intrinsic_ei();
        choice = modal_ask(lines, 2, overwriteButtons, 3);
        intrinsic_di();
        pointer_hide();
        return overwriteButtons[choice].shortcut;
    }
#endif
    printf("Overwrite %s? (o)nce (a)ll (c)ancel ", name);
    return ask("oac");
}

static bool make_dir(void) {
#ifdef __ZXNEXT
    errno = 0;
    esx_f_mkdir(installDir);
    return !errno || errno == ESX_EEXIST;
#else
    return card_mkdir(installDir);
#endif
}

// The suggested directory and its parents may not exist yet. installDir starts with the drive, "C:/"
unsigned char *dir_make(void) {
    unsigned char *at = installDir + 3;
    unsigned char chr;

    do {
        while(*at && *at != '/') at++;
        chr = *at;
        *at = 0;
        if(!make_dir()) {
            *at = chr;
            return err_bad_directory;
        }
        *at++ = chr;
    } while(chr);
    return NULL;
}

static bool use_suggested(void) {
    if(!*suggestDir) return false;
    sprintf(installDir, "C:%s", suggestDir);
    printf("Install to %s? (y/n) ", installDir);
    return ask("yn") == 'y';
}

unsigned char install(char *id) __z88dk_fastcall {
    unsigned char *error;
    unsigned char result;
    int code;

    sprintf(zipPath, "C:/tmp/%s-%04x.zip", id, serial);
    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))download, id))) NBN_Fail(error);

    if(!quiet) printf("Installing to %s\n", installDir);
    result = unzip(zipPath, installDir);
    if(result == UNZIP_E_NOMEM) NBN_Fail(err_no_memory);
    if(result == UNZIP_E_READ || result == UNZIP_E_CREATE || result == UNZIP_E_WRITE) {
        code = errno ? errno : IO_ERROR;
        gui_end();
        print_error(unzipErrors[result - 1]);
        exit(code);
    }
    remove_file(zipPath);
    if(result) return result;

    write_catalogue(id);
    if(!quiet) printf("Installed\n");
    return UNZIP_OK;
}

// id may be an alias. The reply names the app's real id, which alone goes on: to the catalogue,
// the zip's path and the directory choice. An old server sends no id, and the typed name stays
unsigned char *spun_get(char *id) {
    unsigned char *error;
    unsigned char result;

    *appid = 0;
    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))latest, id))) return error;
    if(*appid && strcmp(appid, id)) {
        id = (char *)appid;
        check_catalogue(id);
    }

    if(!quiet) printf("%s\n%s\n", title, version);
    if(installed) {
        if(installedSerial > serial) return err_installed_newer;
        if(installedSerial == serial) {
            printf("Installed. Install again? (y/n) ");
            if(ask("yn") != 'y') return NULL;
        }
    } else if(use_suggested()) {
        if((error = dir_make())) return error;
    } else {
        if(!choose_dir()) return NULL;
        printf("Install to %s? (y/n) ", installDir);
        if(ask("yn") != 'y') return NULL;
    }

    check_install_drive();
    if((result = install(id))) return unzipErrors[result - 1];
    getInstalled = true;
    return NULL;
}

unsigned char *spun_update(void) {
    unsigned char *error;
    unsigned char result;
    uint16_t done = 0;
    uint16_t skip;

    updates = 0;
    updateError = NULL;
    while(open_in(catalogue)) {
        for(skip = done; skip && next_line(); skip--);
        if(!next_line()) {
            close_in();
            break;
        }
        close_in();
        done++;

        if(!*entry || *entry == '#' || *entry == ';') continue;
        strcpy(installDir, entry + parse_entry());
        strcpy(appid, entryApp);

        if((error = _farWithPointer(BANK_NET, (void *(*)(void *))latest, appid))) {
            if(error == err_wrong_version) return error;

            updateError = error;
            if(guiOpen) continue;
            printf("%s ", appid);
            print_error(error);
            continue;
        }
        if(serial <= entrySerial) continue;

        if(!quiet) printf("%s %s\n", title, version);
        updates++;
        check_install_drive();
        if((result = install(appid))) {
            updateError = unzipErrors[result - 1];
            if(guiOpen) continue;
            printf("%s ", appid);
            print_error(unzipErrors[result - 1]);
        }
    }

    if(!updates && !quiet) printf("No updates\n");
    return NULL;
}
