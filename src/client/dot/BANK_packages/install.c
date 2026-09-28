#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "catalogue.h"
#include "install.h"

static uint16_t updates;

static unsigned char *unzipErrors[] = {
    err_no_memory, err_unzip_read, err_unzip_format, err_unzip_unsupported, err_unzip_path,
    err_unzip_create, err_unzip_write, err_unzip_data, err_unzip_check
};

static void print_error(unsigned char *text) __z88dk_fastcall {
    unsigned char chr;

    do {
        chr = *text++;
        putchar(chr & 0x7F);
    } while(!(chr & 0x80) && *text);
    putchar('\n');
}

static bool ask(void) {
    unsigned char chr;

#ifdef __ZXNEXT
    in_wait_nokey();
    do {
        chr = tolower(in_inkey());
    } while(chr != 'y' && chr != 'n');
    in_wait_nokey();
    printf("%c\n", chr);
#else
    unsigned char answer[8];

    do {
        fflush(stdout);
        if(!fgets(answer, sizeof(answer), stdin)) return false;
        chr = tolower(answer[0]);
    } while(chr != 'y' && chr != 'n');
#endif
    return chr == 'y';
}

static unsigned char install(char *id) __z88dk_fastcall {
    unsigned char *error;
    unsigned char result;
    int code;

    sprintf(zipPath, "C:/tmp/%s-%04x.zip", id, serial);
    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))download, id))) NBN_Fail(error);

    printf("Installing to %s\n", installDir);
    result = unzip(zipPath, installDir);
    if(result == UNZIP_E_NOMEM) NBN_Fail(err_no_memory);
    if(result == UNZIP_E_READ || result == UNZIP_E_CREATE || result == UNZIP_E_WRITE) {
        code = errno ? errno : IO_ERROR;
        print_error(unzipErrors[result - 1]);
        exit(code);
    }
    remove_file(zipPath);
    if(result) return result;

    write_catalogue(id);
    printf("Installed\n");
    return UNZIP_OK;
}

unsigned char *spun_get(char *id) {
    unsigned char *error;
    unsigned char result;

    if((error = _farWithPointer(BANK_NET, (void *(*)(void *))latest, id))) return error;

    printf("%s\n%s\n", title, version);
    if(installed) {
        if(installedSerial > serial) return err_installed_newer;
        if(installedSerial == serial) {
            printf("Installed. Install again? (y/n) ");
            if(!ask()) return NULL;
        }
    } else {
        if(!choose_dir()) return NULL;
        printf("Install to %s? (y/n) ", installDir);
        if(!ask()) return NULL;
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

            printf("%s ", appid);
            print_error(error);
            continue;
        }
        if(serial <= entrySerial) continue;

        printf("%s %s\n", title, version);
        updates++;
        check_install_drive();
        if((result = install(appid))) {
            printf("%s ", appid);
            print_error(unzipErrors[result - 1]);
        }
    }

    if(!updates) printf("No updates\n");
    return NULL;
}
