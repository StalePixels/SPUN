#ifndef __ZXNEXT
#include <inttypes.h>
#else
#pragma printf = "%lu %s %u %x"
#pragma output CLIB_EXIT_STACK_SIZE = 1

#include <z80.h>
#include <arch/zxn.h>
#include <intrinsic.h>
#include <arch/zxn/esxdos.h>
#endif

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#include "help.h"
#include "spun_messages.h"
#include "../../vendor/NBNtools/clients/common/messages.h"
#include "../../vendor/NBNtools/clients/common/util.h"
#include "../../vendor/NBNtools/clients/common/uart.h"
#include "../../vendor/NBNtools/clients/common/net.h"
#include "../../vendor/NBNtools/clients/common/nbn.h"

#ifdef __ZXNEXT
unsigned int prescalar;

static unsigned long uart_clock[] = { CLK_28_0, CLK_28_1, CLK_28_2, CLK_28_3, CLK_28_4, CLK_28_5, CLK_28_6, CLK_28_7 };
static unsigned char old_cpu_speed;
#endif

static uint32_t blocks = 0;
static uint32_t size = 0;
static uint16_t remainder = 0;
static unsigned char filename[128];

static unsigned char username[17];
static unsigned char title[33];
static unsigned char description[257];
static uint16_t totalItems;
static uint16_t page = 1;
static uint8_t pageItems;
static uint16_t totalPages;
static uint16_t blockSize;
static uint16_t blockAt;

static unsigned char appid[7];
static uint16_t serial;
static unsigned char version[17];
static unsigned char date[11];
static unsigned char serverError[33];

static unsigned char catalogue[] = "/sys/spun.cat";
static unsigned char catalogueTemp[] = "/sys/SPUNTEMP.$$$";
static unsigned char spunList[] = "/tmp/SPUNLIST.TMP";
static unsigned char entry[48];
static bool lineEnd;
static unsigned char entryApp[7];
static uint16_t entrySerial;
static uint16_t updates;

uint32_t counter;

unsigned char file_out;
unsigned char file_in;

#define SCREEN_WIDTH 32

static unsigned char defaultServer[] = SPUN_SERVER;
static unsigned char defaultPort[] = SPUN_PORT;
static uint8_t customServer = 0;
static uint8_t customPort = 0;
static uint8_t commandArg = 0;
static uint8_t valueArg = 0;
static uint8_t pageArg = 0;

static void shutdown() {
    NET_Close();
    if(file_out) esxdos_f_close(file_out);
    if(file_in) esxdos_f_close(file_in);
    NBN_Free();

#ifdef __ZXNEXT
    zx_border(7);
    ZXN_NEXTREGA(REG_TURBO_MODE, old_cpu_speed);
#endif
}

static void help_and_exit(unsigned char *error) __z88dk_fastcall {
    printf("%s\n", help);

#ifdef __ZXNEXT
    ZXN_NEXTREGA(REG_TURBO_MODE, old_cpu_speed);
#endif
    if(error) NBN_Fail(error);
    exit(0);
}

static void parse_page(char *text) __z88dk_fastcall {
    uint32_t value = 0;

    if(!*text) help_and_exit(err_invalid_option);
    for(; *text; text++) {
        if(!isdigit(*text)) help_and_exit(err_invalid_option);
        value = value * 10 + (*text - '0');
        if(value > 65535) help_and_exit(err_invalid_option);
    }
    if(!value) help_and_exit(err_invalid_option);

    page = value;
}

static void net_open(char *server, char *port) {
#ifdef __ZXNEXT
    IO_NEXTREG_REG = REG_VIDEO_TIMING;
    prescalar = uart_clock[IO_NEXTREG_DAT] / 115200UL;

    IO_UART_BAUD_RATE = prescalar & 0x7f;
    IO_UART_BAUD_RATE = ((prescalar >> 7) & 0x7f) | 0x80;

    errno = 0;
    errno = NET_GetOK(false);

    if(errno) {
        printf("Closing Existing connections...\n");
        NET_Close();
    }
#endif

    printf("Opening %s\n", server);

    NET_Connect(server, port);

#ifdef __ZXNEXT
    errno = UART_WaitOK(false);

    if(errno) {
        NBN_Fail(err_failed_connection);
    }

    NET_ModeSingle();

    NET_OpenSocket();

    errno = 255;
    while (1) {
        errno--;
        unsigned char okflag = NET_GetUChar();

        if (okflag == '>') {
            break;
        }

        if (errno==0) {
            NBN_Fail(err_failed_connection);
        }
    }
#endif
}

// Not NBN_CheckVersionByte: it prints the server's error text. The error comes back to the
// caller, and the rest of the error line is read, so a later caller can go on to the next app
static unsigned char *check_version(void) {
    unsigned char chr = NET_GetUChar();
    uint8_t at = 0;

    if(chr == NBN_PROTOCOL_VERSION) return NULL;
    if(!(chr & 64)) return err_wrong_version;

    while(chr != '\x0A') {
        if(chr != '\x0D' && at + 1 < sizeof(serverError)) serverError[at++] = chr;
        chr = NET_GetUChar();
    }
    serverError[at] = 0;

    if(strcmp(serverError, "NoApp_ERROR") == 0) return err_no_app;
    if(strcmp(serverError, "BadQuery_ERROR") == 0) return err_bad_query;
    if(strcmp(serverError, "NoFile_ERROR") == 0) return err_no_file;
    return err_server_error;
}

static void net_string(unsigned char *dest, uint16_t length) {
    uint16_t at = 0;
    unsigned char chr;

    while((chr = NET_GetUChar())) {
        if(at + 1 < length) dest[at++] = chr;
    }
    dest[at] = 0;
}

static void read_counts(void) {
    NET_GetUInt16((uint8_t *)&totalItems);
    NET_GetUInt16((uint8_t *)&page);
    pageItems = NET_GetUInt8();
    NET_GetUInt16((uint8_t *)&totalPages);
}

static unsigned char *send_query(bool info) __z88dk_fastcall {
    unsigned char *error;
    uint8_t retries = 3;

    while(1) {
        NET_Send(nbnBuff, strlen(nbnBuff));

        if((error = check_version())) return error;
        if(info) {
            net_string(username, sizeof(username));
            net_string(title, sizeof(title));
            net_string(description, sizeof(description));
        }
        read_counts();

        NET_GetUInt16((uint8_t *)&blockSize);
        if(blockSize > NBN_MAX_BLOCKSIZE) NBN_Fail(err_nbn_protocol);
        if(NBN_GetBlock(blockSize)) break;

        retries--;
        if(!retries) NBN_Fail(err_transfer_error);
    }
    blockAt = 0;
    return NULL;
}

// The block is paged over the screen at 0x4000, so page it out again before anything prints
static unsigned char block_byte(void) {
    unsigned char value;

    if(blockAt >= blockSize) NBN_Fail(err_nbn_protocol);

    NBN_PageIn();
    value = nbnBlock[blockAt++];
    NBN_PageOut();

    return value;
}

static uint16_t block_uint16(void) {
    uint16_t value = block_byte();

    return value | (block_byte() << 8);
}

static void block_string(unsigned char *dest, uint16_t length) {
    uint16_t at = 0;
    unsigned char chr;

    while((chr = block_byte())) {
        if(at + 1 < length) dest[at++] = chr;
    }
    dest[at] = 0;
}

static unsigned char *send_info(char *id) __z88dk_fastcall {
    sprintf(nbnBuff, "INFO %s %u\x0A", id, page);
    return send_query(true);
}

static unsigned char *spun_find(char *text) __z88dk_fastcall {
    unsigned char *error;

    sprintf(nbnBuff, "FIND %u %s\x0A", page, text);
    if((error = send_query(false))) return error;

    if(!totalItems) {
        printf("0 found\n");
        return NULL;
    }
    printf("%u found, page %u of %u\n\n", totalItems, page, totalPages);

    for(counter = pageItems; counter; counter--) {
        for(uint8_t at = 0; at < 6; at++) appid[at] = block_byte();
        appid[6] = 0;
        block_string(username, sizeof(username));
        block_string(title, sizeof(title));
        serial = block_uint16();
        block_string(version, sizeof(version));

        printf("%s %.25s\n", appid, title);
    }
    return NULL;
}

static void print_wrapped(unsigned char *text) __z88dk_fastcall {
    uint16_t length;
    uint8_t cut;
    unsigned char kept;

    while(*text) {
        while(*text == ' ') text++;
        length = strlen((char *)text);
        if(length <= SCREEN_WIDTH) {
            printf("%s\n", text);
            return;
        }

        for(cut = SCREEN_WIDTH; cut && text[cut] != ' '; cut--);
        if(!cut) cut = SCREEN_WIDTH;

        kept = text[cut];
        text[cut] = 0;
        printf("%s\n", text);
        text[cut] = kept;
        text += cut;
    }
}

static unsigned char *spun_info(char *id) __z88dk_fastcall {
    unsigned char *error;

    if((error = send_info(id))) return error;

    printf("%s\nby %s\n\n", title, username);
    if(*description) {
        print_wrapped(description);
        printf("\n");
    }
    printf("%u releases, page %u of %u\n\n", totalItems, page, totalPages);

    for(counter = pageItems; counter; counter--) {
        serial = block_uint16();
        block_string(version, sizeof(version));
        block_string(date, sizeof(date));

        printf("%s %s\n", version, date);
    }
    return NULL;
}

static void receive_block(uint16_t length) __z88dk_fastcall {
    uint8_t retries = 3;

    while(!NBN_GetBlock(length)) {
        retries--;
        if(!retries) NBN_Fail(err_transfer_error);

        NET_PutCh(NBN_BLOCK_FAIL);
        NET_Send("\x0D\x0A", 2);
    }

    if(!NBN_WriteBlock(file_out, length)) exit(errno);
}

static void file_check(void) {
    if(errno) exit(errno);
}

static bool open_in(unsigned char *name) __z88dk_fastcall {
    uint8_t handle;

    errno = 0;
    handle = esxdos_f_open(name, ESXDOS_MODE_R);
    if(errno) return false;

    file_in = handle;
    return true;
}

static void close_in(void) {
    errno = 0;
    esxdos_f_close(file_in);
    file_in = 0;
    file_check();
}

static void create_out(unsigned char *name) __z88dk_fastcall {
    uint8_t handle;

    errno = 0;
    handle = esxdos_f_open(name, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    file_check();
    file_out = handle;
}

static void close_out(void) {
    errno = 0;
    esxdos_f_close(file_out);
    file_out = 0;
    file_check();
}

static void write_out(void *text, uint16_t length) {
    errno = 0;
    esxdos_f_write(file_out, text, length);
    file_check();
}

static bool read_byte(unsigned char *chr) __z88dk_fastcall {
    int got;

    errno = 0;
    got = esxdos_f_read(file_in, chr, 1);
    file_check();

    return got;
}

static bool read_line(void) {
    unsigned char chr;
    uint8_t at = 0;
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

static bool next_line(void) {
    bool any = read_line();

    finish_line(false);
    return any;
}

static bool remove_file(unsigned char *name) __z88dk_fastcall {
    uint8_t handle;

    errno = 0;
    handle = esxdos_f_open(name, ESXDOS_MODE_R);
    if(errno) return false;

    esxdos_f_close(handle);
    errno = 0;
    esxdos_f_unlink(name);
    file_check();

    return true;
}

static uint8_t parse_entry(void) {
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

    return at;
}

static void bad_line(uint16_t line) __z88dk_fastcall {
    printf("Line %u: bad entry\n", line);
}

static void commit_catalogue(void) {
    remove_file(catalogue);

    errno = 0;
    esx_f_rename(catalogueTemp, catalogue);
    file_check();
}

static void write_catalogue(char *id) __z88dk_fastcall {
    bool found = false;
    uint8_t rest;

    remove_file(catalogueTemp);
    open_in(catalogue);
    create_out(catalogueTemp);

    sprintf(nbnBuff, "%s %04x %s", id, serial, version);

    while(file_in && read_line()) {
        if((rest = parse_entry()) && strcmp(entryApp, id) == 0) {
            found = true;
            write_out(nbnBuff, strlen(nbnBuff));
            write_out(entry + rest, strlen(entry + rest));
        } else {
            write_out(entry, strlen(entry));
        }
        finish_line(true);
        write_out("\x0A", 1);
    }
    if(!found) {
        write_out(nbnBuff, strlen(nbnBuff));
        write_out("\x0A", 1);
    }

    if(file_in) close_in();
    close_out();

    commit_catalogue();
}

static unsigned char *latest(char *id) __z88dk_fastcall {
    unsigned char *error;

    if((error = send_info(id))) return error;

    if(!pageItems) return err_no_release;
    serial = block_uint16();
    block_string(version, sizeof(version));
    return NULL;
}

static unsigned char *download(char *id) __z88dk_fastcall {
    unsigned char *error;

    sprintf(nbnBuff, "GET %s/%s-%04x.zip\x0A", username, id, serial);
    NET_Send(nbnBuff, strlen(nbnBuff));

    if((error = check_version())) return error;
    NET_GetUInt32((uint8_t *)&size);
    NET_GetUInt32((uint8_t *)&blocks);
    NET_GetUInt16((uint8_t *)&remainder);
    net_string(filename, sizeof(filename));

    errno = 0;
    file_out = esxdos_f_open(filename, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    if (errno)
    {
        file_out = 0;
        printf("Could not create:\n %s\n", filename);

        exit(errno);
    }

    printf("Name: %s\nSize: %lu bytes\n", filename, (unsigned long)size);

    for(;blocks>0;blocks--) {
        NET_PutCh(NBN_BLOCK_SUCCESS);
        NET_Send("\x0D\x0A", 2);

        receive_block(NBN_MAX_BLOCKSIZE);
    }
    NET_Send("!", 1);
    NET_Send("\x0D\x0A", 2);

    receive_block(remainder);
    NET_PutCh(NBN_BLOCK_SUCCESS);
    NET_Send("\x0D\x0A", 2);

    esxdos_f_close(file_out);
    file_out = 0;

    printf("Transfer complete\n");

    write_catalogue(id);
    return NULL;
}

static unsigned char *spun_get(char *id) __z88dk_fastcall {
    unsigned char *error;

    if((error = latest(id))) return error;

    printf("%s\n%s\n", title, version);
    return download(id);
}

static void print_error(unsigned char *text) __z88dk_fastcall {
    unsigned char chr;

    do {
        chr = *text++;
        putchar(chr & 0x7F);
    } while(!(chr & 0x80) && *text);
    putchar('\n');
}

static unsigned char *list_updates(void) {
    unsigned char *error;
    uint16_t line = 0;

    if(remove_file(spunList)) printf("Deleted a stale download list\n");

    updates = 0;
    create_out(spunList);
    open_in(catalogue);

    while(file_in && next_line()) {
        line++;

        if(!*entry || *entry == '#' || *entry == ';') continue;
        if(!parse_entry()) {
            bad_line(line);
            continue;
        }

        if((error = latest(entryApp))) {
            if(error == err_wrong_version) return error;

            printf("%s ", entryApp);
            print_error(error);
            continue;
        }
        if(serial <= entrySerial) continue;

        sprintf(nbnBuff, "%s %04x %s %s\x0A", entryApp, serial, version, username);
        write_out(nbnBuff, strlen(nbnBuff));
        printf("%s %s\n", title, version);
        updates++;
    }
    if(file_in) close_in();
    close_out();

    if(!updates) {
        printf("No updates\n");
        remove_file(spunList);
    } else {
        printf("%u update(s)\n", updates);
    }
    return NULL;
}

static unsigned char *download_list(void) {
    unsigned char *error;
    uint16_t done = 0;
    uint16_t skip;
    uint8_t at;
    uint8_t to;

    while(open_in(spunList)) {
        for(skip = done; skip && next_line(); skip--);
        if(!next_line()) {
            close_in();
            break;
        }
        close_in();
        done++;

        if(!(at = parse_entry())) {
            bad_line(done);
            continue;
        }
        strcpy(appid, entryApp);
        serial = entrySerial;

        to = 0;
        if(entry[at]) {
            for(at++; entry[at] && to + 1 < sizeof(username); at++) username[to++] = entry[at];
        }
        username[to] = 0;

        if((error = download(appid))) return error;
    }

    remove_file(spunList);
    return NULL;
}

static unsigned char *spun_update(void) {
    unsigned char *error;

    if((error = list_updates())) return error;
    if(!updates) return NULL;
    return download_list();
}

int main(int argc, char** argv) {
    unsigned char *error;

#ifdef __ZXNEXT
    old_cpu_speed = ZXN_READ_REG(REG_TURBO_MODE);

    ZXN_NEXTREG(REG_TURBO_MODE, 3);

    zx_cls(PAPER_WHITE);
#endif

    counter = 0;
    while(counter+1<argc) {
        counter=counter+1;

        if (stricmp(argv[counter], "-s") == 0) {
            if(counter+2>argc) {
                help_and_exit(err_bad_server);
            }
            counter++;

            customServer = counter;
        } else

        if (stricmp(argv[counter], "-p") == 0) {
            if(counter+2>argc) {
                help_and_exit(err_bad_port);
            }
            counter++;

            customPort = counter;
        } else

        if (argv[counter][0]=='-') {
            help_and_exit(err_invalid_option);
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
            help_and_exit(err_invalid_option);
        }
    }

    if(!commandArg) {
        help_and_exit(NULL);
    }

    if (stricmp(argv[commandArg], "update") == 0) {
        if(valueArg) help_and_exit(err_invalid_option);
    } else {
        if(!valueArg || !*argv[valueArg]) {
            help_and_exit(err_invalid_option);
        }

        if (stricmp(argv[commandArg], "get") == 0) {
            if(pageArg) help_and_exit(err_invalid_option);
        } else if (stricmp(argv[commandArg], "find") != 0 && stricmp(argv[commandArg], "info") != 0) {
            help_and_exit(err_invalid_option);
        }

        if (stricmp(argv[commandArg], "find") != 0) {
            for(char *chr = argv[valueArg]; *chr; chr++) *chr = tolower(*chr);
        }
    }

    if(pageArg) parse_page(argv[pageArg]);

    if (stricmp(argv[commandArg], "update") == 0) {
        if(!open_in(catalogue)) {
            printf("No updates\n");
            exit(0);
        }
        close_in();
    }

    atexit(shutdown);

    if(!NBN_Malloc()) {
        printf("NO MEMORY\n");
        exit(0);
    }

    net_open((customServer ? argv[customServer] : (char *)defaultServer), (customPort ? argv[customPort] : (char *)defaultPort));

    if (stricmp(argv[commandArg], "find") == 0) {
        error = spun_find(argv[valueArg]);
    } else if (stricmp(argv[commandArg], "info") == 0) {
        error = spun_info(argv[valueArg]);
    } else if (stricmp(argv[commandArg], "update") == 0) {
        error = spun_update();
    } else {
        error = spun_get(argv[valueArg]);
    }

    if(error) NBN_Fail(error);
    exit(0);
}
