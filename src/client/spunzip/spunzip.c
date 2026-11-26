#include <arch/zxn.h>
#include <arch/zxn/esxdos.h>
#include <arch/zxn/sysvar.h>
#include <ctype.h>
#include <errno.h>
#include <input.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "../unzip/unzip.h"

static const char help[] =
    "SPUNZIP: SPUN's unzipper\n"
    "Extract files from .zip archives\n"
    "\n"
    "SYNOPSIS:\n"
    ".SPUNZIP [OPT] ZIPFILE [DIR]\n"
    "\n"
    "OPTIONS:\n"
    " -h, --help\n"
    "     Display this help\n"
    " -j, --junk\n"
    "     Junk paths\n"
    " -o, --overwrite\n"
    "     Overwrite existing files\n"
    " -v, --view\n"
    "     View archive contents only\n"
    " -q, --quiet\n"
    "     Quiet mode (implies -o)\n"
    " -m, --macdata\n"
    "     Don't ignore Mac resources\n"
    "\n"
    "DIR: extract there, not to the\n"
    "current directory\n"
    "\n"
    "Supported compression methods:\n"
    " store, deflate\n"
    "\n"
    "DEFLATE: Laurens Holst (Grauw),\n"
    "Wouter Vermaelen. 2-clause BSD\n";

static const char *const errors[] = {
    "Not enough free memory", "Cannot read the zip", "Zip is damaged or not a zip",
    "Compression method or zip feature not supported", "Zip has an unsafe file name",
    "Cannot create a file", "Cannot write a file", "Zip data is damaged",
    "Extracted file failed its CRC check", "Unzip cancelled"
};

static const char keys[] = "ynaq";
static const unsigned char answers[] = { OVERWRITE_ONCE, OVERWRITE_SKIP, OVERWRITE_ALL, OVERWRITE_CANCEL };

static bool quiet;
static char zip_path[ESX_PATHNAME_MAX + 4];
static char dir_path[ESX_PATHNAME_MAX];
static char failure[64];

void progress_bytes(unsigned long done, unsigned long total, unsigned char *name) {
    (void)total;
    if (quiet || done) return;
    SYSVAR_SCRCT = 255;
    printf("%s\n", name);
}

unsigned char overwrite_ask(const char *name) {
    unsigned char chr;
    unsigned char i;

    SYSVAR_SCRCT = 255;
    printf("%s - overwrite (y/n/a/q)? ", name);
    in_wait_nokey();
    do {
        chr = tolower(in_inkey());
        for (i = 0; keys[i] && keys[i] != chr; i++);
    } while (!keys[i]);
    in_wait_nokey();
    printf("%c\n", chr);
    return answers[i];
}

static void view_entry(const char *name, unsigned long size) {
    SYSVAR_SCRCT = 255;
    printf("%10lu %s\n", size, name);
}

// A dot command's error is its message, with bit 7 set on the last character
static int fail(const char *text, const char *more) {
    strcpy(failure, text);
    if (more) strncat(failure, more, sizeof(failure) - 1 - strlen(failure));
    failure[strlen(failure) - 1] |= 0x80;
    return (int)failure;
}

static bool is(const char *arg, const char *brief, const char *full) {
    return !strcmp(arg, brief) || !strcmp(arg, full);
}

// As the stock .UNZIP does, a name with no extension gets .zip
static bool set_zip_path(const char *name) {
    const char *base = name;
    const char *p;

    if (strlen(name) + 5 > sizeof(zip_path)) return false;
    for (p = name; *p; p++) if (*p == '/' || *p == '\\' || *p == ':') base = p + 1;
    strcpy(zip_path, name);
    if (!strchr(base, '.')) strcat(zip_path, ".zip");
    return true;
}

#ifdef __SDCC
// zsdcc warns about any main with arguments; the dotn crt passes argc and argv
#pragma disable_warning 323
#endif
// At 28 MHz, as .spun runs its unzip
int main(int argc, char **argv) {
    unsigned char flags = UNZIP_NO_MAC | UNZIP_ASK_EACH;
    unsigned char r;
    unsigned char speed;
    bool view = false;
    const char *zip = NULL;
    const char *dir = NULL;
    const char *arg;
    int error;
    int i;

    for (i = 1; i < argc; i++) {
        arg = argv[i];
        if (arg[0] != '-') {
            if (zip && dir) {
                zip = NULL;
                break;
            }
            if (zip) dir = arg;
            else zip = arg;
        } else if (is(arg, "-h", "--help")) {
            zip = NULL;
            break;
        } else if (is(arg, "-j", "--junk")) flags |= UNZIP_JUNK;
        else if (is(arg, "-o", "--overwrite")) flags |= UNZIP_YES;
        else if (is(arg, "-v", "--view")) view = true;
        else if (is(arg, "-q", "--quiet")) {
            quiet = true;
            flags |= UNZIP_YES;
        } else if (is(arg, "-m", "--macdata")) flags &= ~UNZIP_NO_MAC;
        else return fail("Unknown option: ", arg);
    }
    if (!zip) {
        fputs(help, stdout);
        return 0;
    }
    if (!set_zip_path(zip)) return fail(errors[UNZIP_E_PATH - 1], NULL);
    if (!dir) {
        errno = 0;
        esx_f_getcwd(dir_path);
        if (errno) return errno;
        dir = dir_path;
    }

    speed = ZXN_READ_REG(REG_TURBO_MODE);
    ZXN_NEXTREG(REG_TURBO_MODE, 3);
    r = view ? unzip_view(zip_path, flags, view_entry) : unzip(zip_path, dir, flags);
    error = errno;
    ZXN_NEXTREGA(REG_TURBO_MODE, speed);

    if (r == UNZIP_OK) return 0;
    if ((r == UNZIP_E_READ || r == UNZIP_E_CREATE || r == UNZIP_E_WRITE) && error) {
        if (!quiet) printf("%s\n", errors[r - 1]);
        return error;
    }
    return fail(errors[r - 1], NULL);
}
