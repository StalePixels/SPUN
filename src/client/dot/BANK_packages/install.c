#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "catalogue.h"
#include "install.h"
#include "../BANK_deps/deps.h"
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
static const struct modal_button overwriteButtons[] = {
    { OVERWRITE_ONCE, "Once", INK_GREEN }, { OVERWRITE_ALL, "All", INK_YELLOW }, { OVERWRITE_CANCEL, "Cancel", INK_RED }
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
static unsigned char ask(const char *keys) {
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
    unsigned char answer;
#ifdef __ZXNEXT
    unsigned char *line = (unsigned char *)name;
    uint8_t choice;

    if(guiOpen) {
        intrinsic_ei();
        choice = modal_ask((const unsigned char *)"Overwrite", &line, 1, overwriteButtons, 3);
        intrinsic_di();
        pointer_hide();
        answer = overwriteButtons[choice].shortcut;
    } else
#endif
    {
        printf("Overwrite %s? (o)nce (a)ll (c)ancel ", name);
        answer = ask("oac");
    }
    if(answer == OVERWRITE_ALL) overwriteAll = true;
    return answer;
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
    int code;

    do {
        while(*at && *at != '/') at++;
        chr = *at;
        *at = 0;
        if(!make_dir()) {
            code = errno ? errno : IO_ERROR;
            *at = chr;
            gui_end();
            print_error(err_bad_directory);
            exit(code);
        }
        *at++ = chr;
    } while(chr);
    return NULL;
}

static void name_print(void) {
    if(!quiet) printf("Name: %s\nVersion: %s\n", title, version);
}

static bool use_suggested(void) {
    if(!*suggestDir) return false;
    sprintf(installDir, "C:%s", suggestDir);
    printf("Install to %s? (y/n) ", installDir);
    return ask("yn") == 'y';
}

unsigned char install(char *id, bool yes) {
    unsigned char *error;
    unsigned char result;
    int code;

#ifdef __ZXNEXT
    if(!guiOpen) SYSVAR_SCRCT = 255;
#endif
    sprintf(zipPath, "C:/tmp/%s-%04x.zip", id, serial);
    if((error = _farWithPointer(BANK_NET, (far_ptr_fn_t)download, id))) NBN_Fail(error);

    if(!quiet) printf("Installing to %s\nUnzipping %s\n", installDir, title);
    result = unzip(zipPath, installDir, yes || overwriteAll ? UNZIP_YES : 0);
    progress_end();
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

static bool walking;

// A get, an install in the browser and an update each start with no "All" answer and no warning
void install_start(void) {
    overwriteAll = false;
    depWarning = NULL;
    walking = false;
}

unsigned char *deps_check(void) {
    if(!dependsCount) return NULL;
    return _far(BANK_DEPS, (far_fn_t)deps_list);
}

// The dependencies go in before the app, from the tree deps_check listed. BANK_DEPS comes back
// here for each one, so a dependency's own install never walks it again
unsigned char *deps_first(void) {
    unsigned char *error;

    if(!dependsCount || walking) return NULL;
    walking = true;
    error = _far(BANK_DEPS, (far_fn_t)deps_install);
    walking = false;
    return error;
}

// The directory a dependency has of its own: where it is installed, or the one its publisher
// suggests. NULL when it has neither. The result is installDir, in main memory
unsigned char *dep_dir(char *id) {
    check_catalogue(id);
    if(installed) return installDir;
    if(_farWithPointer(BANK_NET, (far_ptr_fn_t)latest, id) || !*suggestDir) return NULL;
    sprintf(installDir, "C:%s", suggestDir);
    return installDir;
}

// A dependency is installed or updated to its latest release without a question. It goes where
// it is installed, to the directory its publisher suggests, or else to parentDir
unsigned char *dep_install(char *id) {
    unsigned char *error;
    unsigned char result;

    check_catalogue(id);
    if((error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, id))) return error;
    if(installed && installedSerial >= serial) return NULL;

    if(!quiet) printf("Dependency: %s %s\n", title, version);
    if(!installed) {
        if(*suggestDir) sprintf(installDir, "C:%s", suggestDir);
        else strcpy(installDir, parentDir);
        dir_make();
    }

    check_install_drive();
    if((result = install(id, false))) return unzipErrors[result - 1];
    return NULL;
}

// id may be an alias. The reply names the app's real id, which alone goes on: to the catalogue,
// the zip's path and the directory choice. An old server sends no id, and the typed name stays
unsigned char *spun_get(char *id) {
    unsigned char *error;
    unsigned char result;

    install_start();
    *appid = 0;
    if((error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, id))) return error;
    if(*appid && strcmp(appid, id)) {
        id = (char *)appid;
        check_catalogue(id);
    }

    name_print();
    if((error = core_check(title, minCore))) return error;
    if(installed && installedSerial > serial) return err_installed_newer;
    if((error = deps_check())) return error;
    if(installed) {
        if(installedSerial == serial) {
            printf("Installed. Install again? (y/n) ");
            if(ask("yn") != 'y') return NULL;
        }
    } else if(use_suggested()) {
        dir_make();
    } else {
        if(!choose_dir()) return NULL;
        printf("Install to %s? (y/n) ", installDir);
        if(ask("yn") != 'y') return NULL;
    }

    if((error = deps_first())) return error;
    check_install_drive();
    if((result = install(id, false))) return unzipErrors[result - 1];
    getInstalled = true;
    return NULL;
}

unsigned char *spun_update(void) {
    unsigned char *error;
    unsigned char result;
    uint16_t done = 0;
    uint16_t skip;

    install_start();
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

        if((error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, appid))) {
            if(error == err_wrong_version) return error;

            updateError = error;
            if(guiOpen) continue;
            printf("%s ", appid);
            print_error(error);
            continue;
        }
        if(serial <= entrySerial) continue;

        name_print();
        updates++;
        if((error = core_check(title, minCore))) {
            updateError = error;
            if(!guiOpen) print_error(error);
            continue;
        }
        if((error = deps_check()) || (error = deps_first())) {
            if(error == unzipErrors[UNZIP_E_ABORT - 1]) return error;
            updateError = error;
            if(guiOpen) continue;
            printf("%s ", appid);
            print_error(error);
            continue;
        }
        check_install_drive();
        if((result = install(appid, false))) {
            if(result == UNZIP_E_ABORT) return unzipErrors[result - 1];
            updateError = unzipErrors[result - 1];
            if(guiOpen) continue;
            printf("%s ", appid);
            print_error(unzipErrors[result - 1]);
        }
    }

    if(!updateError) updateError = depWarning;
    if(!updates && !quiet) printf("No updates\n");
    return NULL;
}

// An old .spun may misread a newer server, so a newer SPUN goes in before any other request.
// name is in main memory, where BANK_NET can read it; the new file runs only from a fresh start
void self_update(char *name) {
    unsigned char *error;
    unsigned char result;
    uint16_t askedPage = page;

    *appid = 0;
    page = 1;
    error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, name);
    page = askedPage;
    if(error == err_no_app) return;
    if(error) NBN_Fail(error);

    check_catalogue(appid);
    if(!installed || serial <= installedSerial) return;

    gui_end();
    check_install_drive();
    if((result = install(appid, true))) NBN_Fail(unzipErrors[result - 1]);
    printf(SPUN_DISPLAY " was updated, please restart " SPUN_DISPLAY " to resume\n");
    exit(0);
}
