#include "common/spun.h"
#include "BANK_net/net.h"
#include "BANK_packages/catalogue.h"
#include "BANK_packages/install.h"
#include "BANK_packages/usage.h"

#ifdef __ZXNEXT
unsigned char old_cpu_speed;

extern unsigned char fileTypes[];
extern unsigned char browserHelp[];
extern unsigned int dos_mapping(unsigned char drive) __z88dk_fastcall;
#endif

char *netServer;
char *netPort;
uint16_t page = 1;
uint32_t counter;
unsigned char username[17];
unsigned char title[33];
unsigned char appid[7];
uint16_t serial;
unsigned char version[17];
unsigned char installDir[256];
unsigned char zipPath[24];
bool getInstalled;

static unsigned char defaultServer[] = SPUN_SERVER;
static unsigned char defaultPort[] = SPUN_PORT;
static uint8_t customServer = 0;
static uint8_t customPort = 0;
static uint8_t commandArg = 0;
static uint8_t valueArg = 0;
static uint8_t pageArg = 0;

static void shutdown() {
    _far(BANK_NET, (void *(*)(void))net_close);
    if(file_out) esxdos_f_close(file_out);
    if(file_in) esxdos_f_close(file_in);
    NBN_Free();

#ifdef __ZXNEXT
    zx_border((SYSVAR_BORDCR >> 3) & 7);
    ZXN_NEXTREGA(REG_TURBO_MODE, old_cpu_speed);
#endif
}

static void usage(unsigned char *error) __z88dk_fastcall {
    _farWithPointer(BANK_PACKAGES, (void *(*)(void *))help_and_exit, error);
}

#ifdef __ZXNEXT
// As .CD does it: the directory, then the drive, which BASIC keeps in LODDRV and SAVDRV
static void enter_install_dir(void) {
    uint8_t drive = installDir[0] & ~0x20;

    errno = 0;
    esx_f_chdir(installDir);
    file_check();
    if(installDir[1] != ':') return;

    if((int16_t)esx_m_dosversion() > 0) {
        errno = 0;
        esx_dos_set_drive(drive);
        if(errno) NBN_Fail(err_drive);
        SYSVAR_LODDRV = drive;
        SYSVAR_SAVDRV = drive;
    } else {
        errno = 0;
        esx_m_setdrv(((drive - 'A') << 3) + 1);
        file_check();
    }
}
#endif

#ifdef __ZXNEXT
// A RAMdisk (unit 4) or a disk image ($ff) has no directories, so nothing can be installed there
void check_install_drive(void) {
    unsigned int unit;

    if(installDir[1] != ':') return;
    unit = dos_mapping(installDir[0] & ~0x20);
    if(unit == 0xffff) NBN_Fail(err_browser);
    if(unit == 4 || unit == 0xff) NBN_Fail(err_no_directories);
}

// Only a directory is wanted, so the file type list is empty. The start directory is put back,
// so .spun ends where it started unless an install succeeds. It is kept in nbnBuff, which is
// free between latest() and download(), the only time this runs
bool choose_dir(void) {
    errno = 0;
    esx_f_getcwd(nbnBuff);
    file_check();

    esx_ide_browser(ESX_BROWSERCAP_MKDIR, fileTypes, browserHelp, NULL, NULL);
    if(errno) NBN_Fail(err_browser);

    esx_f_getcwd(installDir);
    file_check();
    esx_f_chdir(nbnBuff);
    file_check();
    check_install_drive();
    return true;
}
#else
static void make_dir(void) {
    errno = 0;
    if(card_mkdir(installDir)) return;
    printf("Could not create:\n %s\n", installDir);
    exit(errno);
}

bool choose_dir(void) {
    unsigned char *at;
    size_t length;

    printf("Install directory: ");
    fflush(stdout);
    if(!fgets(installDir, sizeof(installDir), stdin)) return false;

    length = strcspn(installDir, "\r\n");
    if(installDir[length] == 0 && !feof(stdin)) NBN_Fail(err_bad_directory);
    installDir[length] = 0;
    if(installDir[0] != '/') NBN_Fail(err_bad_directory);

    for(at = installDir + 1; *at; at++) {
        if(*at != '/') continue;
        *at = 0;
        make_dir();
        *at = '/';
    }
    make_dir();
    return true;
}
#endif

int main(int argc, char** argv) {
    unsigned char *error;

#ifdef __ZXNEXT
    old_cpu_speed = ZXN_READ_REG(REG_TURBO_MODE);

    ZXN_NEXTREG(REG_TURBO_MODE, 3);
#endif

    counter = 0;
    while(counter+1<argc) {
        counter=counter+1;

        if (stricmp(argv[counter], "-s") == 0) {
            if(counter+2>argc) {
                usage(err_bad_server);
            }
            counter++;

            customServer = counter;
        } else

        if (stricmp(argv[counter], "-p") == 0) {
            if(counter+2>argc) {
                usage(err_bad_port);
            }
            counter++;

            customPort = counter;
        } else

        if (argv[counter][0]=='-') {
            usage(err_invalid_option);
        } else

        if (!commandArg) {
            commandArg = counter;
        } else

        if (!valueArg) {
            valueArg = counter;
        } else

        if (!pageArg) {
            pageArg = counter;
        } else {
            usage(err_invalid_option);
        }
    }

    if(!commandArg) {
        usage(NULL);
    }

    if (stricmp(argv[commandArg], "update") == 0) {
        if(valueArg) usage(err_invalid_option);
    } else {
        if(!valueArg || !*argv[valueArg]) {
            usage(err_invalid_option);
        }

        if (stricmp(argv[commandArg], "get") == 0) {
            if(pageArg) usage(err_invalid_option);
        } else if (stricmp(argv[commandArg], "find") != 0 && stricmp(argv[commandArg], "info") != 0) {
            usage(err_invalid_option);
        }

        if (stricmp(argv[commandArg], "find") != 0) {
            for(char *chr = argv[valueArg]; *chr; chr++) *chr = tolower(*chr);
        }
    }

    if(pageArg) _farWithPointer(BANK_PACKAGES, (void *(*)(void *))parse_page, argv[pageArg]);

    if (stricmp(argv[commandArg], "update") == 0) {
        if(!_farWithPointer(BANK_PACKAGES, (void *(*)(void *))check_catalogue, NULL)) {
            printf("No updates\n");
            exit(0);
        }
    } else if (stricmp(argv[commandArg], "get") == 0) {
        _farWithPointer(BANK_PACKAGES, (void *(*)(void *))check_catalogue, argv[valueArg]);
    }

    atexit(shutdown);

    if(!NBN_Malloc()) NBN_Fail(err_no_memory);

    netServer = customServer ? argv[customServer] : (char *)defaultServer;
    netPort = customPort ? argv[customPort] : (char *)defaultPort;
    _far(BANK_NET, (void *(*)(void))net_open);

    if (stricmp(argv[commandArg], "find") == 0) {
        error = _farWithPointer(BANK_NET, (void *(*)(void *))spun_find, argv[valueArg]);
    } else if (stricmp(argv[commandArg], "info") == 0) {
        error = _farWithPointer(BANK_NET, (void *(*)(void *))spun_info, argv[valueArg]);
    } else if (stricmp(argv[commandArg], "update") == 0) {
        error = _far(BANK_PACKAGES, (void *(*)(void))spun_update);
    } else {
        error = _farWithPointer(BANK_PACKAGES, (void *(*)(void *))spun_get, argv[valueArg]);
    }

    if(error) NBN_Fail(error);
#ifdef __ZXNEXT
    if(getInstalled) enter_install_dir();
#endif
    exit(0);
}
