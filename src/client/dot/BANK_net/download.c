#include "../common/spun.h"
#include "net.h"
#include "reply.h"

static uint32_t blocks;
static uint32_t size;
static uint16_t remainder;
static uint16_t done;
static uint16_t total;
static unsigned char filename[128];

static void net_string(unsigned char *dest, uint16_t length) {
    uint16_t at = 0;
    unsigned char chr;

    while((chr = NET_GetUChar())) {
        if(at + 1 < length) dest[at++] = chr;
    }
    dest[at] = 0;
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
        gui_end();
        printf("Could not create:\n %s\n", zipPath);

        exit(errno);
    }

    if(!quiet) printf("Name: %s\nSize: %lu bytes\n", filename, (unsigned long)size);

    done = 0;
    total = blocks + 1;
    for(;blocks>0;blocks--) {
        NET_PutCh(NBN_BLOCK_SUCCESS);
        NET_Send("\x0D\x0A", 2);

        receive_block(NBN_MAX_BLOCKSIZE);
        progress(PROGRESS_DOWNLOAD, ++done, total, filename);
    }
    NET_Send("!", 1);
    NET_Send("\x0D\x0A", 2);

    receive_block(remainder);
    progress(PROGRESS_DOWNLOAD, ++done, total, filename);
    NET_PutCh(NBN_BLOCK_SUCCESS);
    NET_Send("\x0D\x0A", 2);

    close_out();

    if(!quiet) printf("Transfer complete\n");
    return NULL;
}
