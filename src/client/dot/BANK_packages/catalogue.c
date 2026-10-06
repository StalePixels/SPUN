#include "../common/spun.h"
#include "catalogue.h"

// /sys and /tmp exist only on the system drive, and .spun can start on any drive
unsigned char catalogue[] = "C:/sys/" SPUN_NAME ".cat";
unsigned char catalogueTemp[] = "C:/sys/SPUNTEMP.$$$";
unsigned char entry[32 + 256];
unsigned char entryApp[7];
uint16_t entrySerial;
bool installed;
uint16_t installedSerial;
static bool lineEnd;

static bool read_line(void) {
    unsigned char chr;
    uint16_t at = 0;
    bool any = false;

    lineEnd = false;
    while(at + 1 < sizeof(entry)) {
        if(!read_byte(&chr)) {
            lineEnd = true;
            break;
        }

        any = true;
        if(chr == '\x0A') {
            lineEnd = true;
            break;
        }
        if(chr != '\x0D') entry[at++] = chr;
    }
    entry[at] = 0;

    return any;
}

static void finish_line(bool copy) __z88dk_fastcall {
    unsigned char chr;

    while(!lineEnd && read_byte(&chr) && chr != '\x0A') {
        if(copy && chr != '\x0D') write_out(&chr, 1);
    }
}

bool next_line(void) {
    bool any = read_line();

    finish_line(false);
    return any;
}

uint8_t parse_entry(void) {
    uint8_t at;
    unsigned char chr;

    entrySerial = 0;
    for(at = 0; at < 11; at++) {
        chr = entry[at];
        if(at < 6) {
            if(!islower(chr) && !isdigit(chr)) return 0;
            entryApp[at] = chr;
        } else if(at == 6) {
            if(chr != ' ') return 0;
        } else {
            if(!isxdigit(chr)) return 0;
            entrySerial = (entrySerial << 4) | (isdigit(chr) ? chr - '0' : (chr | 0x20) - 'a' + 10);
        }
    }
    entryApp[6] = 0;
    if(entry[11] != ' ') return 0;

    for(at = 12; entry[at] && entry[at] != ' '; at++) {
        if(at - 12 == sizeof(version) - 1) return 0;
        version[at - 12] = entry[at];
    }
    if(at == 12) return 0;
    version[at - 12] = 0;
    if(entry[at] != ' ' || !entry[at + 1]) return 0;

    return at + 1;
}

// Every line is checked before anything is changed, so a bad line ends .spun with the file as it was
int check_catalogue(char *id) {
    uint16_t line = 0;
    uint8_t at;
    bool whole;

    installed = false;
    if(!open_in(catalogue)) return 0;

    while(read_line()) {
        line++;
        whole = lineEnd;
        finish_line(false);

        if(!*entry || *entry == '#' || *entry == ';') continue;
        if(!whole || !(at = parse_entry())) {
            close_in();
            gui_end();
            printf("Line %u: bad entry\n", line);
            NBN_Fail(err_bad_catalogue);
        }

        if(id && !installed && strcmp(entryApp, id) == 0) {
            installed = true;
            installedSerial = entrySerial;
            strcpy(installDir, entry + at);
        }
    }
    close_in();
    return 1;
}

static void commit_catalogue(void) {
    remove_file(catalogue);

    errno = 0;
    esx_f_rename(catalogueTemp, catalogue);
    file_check();
}

void write_catalogue(char *id) __z88dk_fastcall {
    bool found = false;

    remove_file(catalogueTemp);
    open_in(catalogue);
    create_out(catalogueTemp);

    sprintf(nbnBuff, "%s %04x %s ", id, serial, version);

    while(file_in && read_line()) {
        if(parse_entry() && strcmp(entryApp, id) == 0) {
            found = true;
            write_out(nbnBuff, strlen(nbnBuff));
            write_out(installDir, strlen(installDir));
        } else {
            write_out(entry, strlen(entry));
        }
        finish_line(true);
        write_out("\x0A", 1);
    }
    if(!found) {
        write_out(nbnBuff, strlen(nbnBuff));
        write_out(installDir, strlen(installDir));
        write_out("\x0A", 1);
    }

    if(file_in) close_in();
    close_out();

    commit_catalogue();
}
