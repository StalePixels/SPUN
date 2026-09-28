#include "../common/spun.h"
#include "net.h"

#ifdef __ZXNEXT
static unsigned int prescalar;

static unsigned long uart_clock[] = { CLK_28_0, CLK_28_1, CLK_28_2, CLK_28_3, CLK_28_4, CLK_28_5, CLK_28_6, CLK_28_7 };
#endif

static uint32_t blocks;
static uint32_t size;
static uint16_t remainder;
static unsigned char filename[128];
static unsigned char description[257];
static uint16_t totalItems;
static uint8_t pageItems;
static uint16_t totalPages;
static uint16_t blockSize;
static uint16_t blockAt;
static unsigned char date[11];
static unsigned char serverError[33];

void net_open(void) {
#ifdef __ZXNEXT
    IO_NEXTREG_REG = REG_VIDEO_TIMING;
    prescalar = uart_clock[IO_NEXTREG_DAT] / 115200UL;

    IO_UART_BAUD_RATE = prescalar & 0x7f;
    IO_UART_BAUD_RATE = ((prescalar >> 7) & 0x7f) | 0x80;

    errno = 0;
    errno = NET_GetOK(false);

    if(errno) {
        printf("Closing Existing connections...\n");
        NET_Close(true);
    }
#endif

    printf("Opening %s\n", netServer);

    NET_Connect(netServer, netPort);

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

// For shutdown() in main, which reaches the bank only through the trampoline
void net_close(void) {
    NET_Close(true);
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

unsigned char *spun_find(char *text) {
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

unsigned char *spun_info(char *id) {
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

unsigned char *latest(char *id) {
    unsigned char *error;

    if((error = send_info(id))) return error;

    if(!pageItems) return err_no_release;
    serial = block_uint16();
    block_string(version, sizeof(version));
    return NULL;
}

unsigned char *download(char *id) {
    unsigned char *error;

    sprintf(nbnBuff, "GET %s/%s-%04x.zip\x0A", username, id, serial);
    NET_Send(nbnBuff, strlen(nbnBuff));

    if((error = check_version())) return error;
    NET_GetUInt32((uint8_t *)&size);
    NET_GetUInt32((uint8_t *)&blocks);
    NET_GetUInt16((uint8_t *)&remainder);
    net_string(filename, sizeof(filename));

    errno = 0;
    file_out = esxdos_f_open(zipPath, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    if (errno)
    {
        file_out = 0;
        printf("Could not create:\n %s\n", zipPath);

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

    close_out();

    printf("Transfer complete\n");
    return NULL;
}
