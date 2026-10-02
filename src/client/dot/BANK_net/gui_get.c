#include "../common/spun.h"
#include "../gui/gui.h"
#include "net.h"
#include "reply.h"

#define NXI_PALETTE 512

// Where the next byte goes. The UART does not wait, so a byte must cost little: no 32-bit sums
struct l2_place {
    uint16_t palette;
    uint8_t page;
    uint8_t *pixel;
    uint8_t tx;
    uint8_t ty;
};

static struct l2_target *target;
static struct l2_place at;
static uint8_t paletteByte;

static void map(void) {
    ZXN_WRITE_MMU2(layer2Page + at.page);
}

// Through MMU2, which the ISR never uses. A thumbnail goes column by column of 320x256 Layer 2,
// 256 bytes a column and 32 columns a page; an NXI goes straight on from the start of Layer 2
static void put(unsigned char byte) __z88dk_fastcall {
    uint16_t col;

    if(target->width) {
        if(at.ty == target->height) return;
        col = target->x + at.tx;
        if(at.page != (col >> 5)) {
            at.page = col >> 5;
            map();
        }
        *((uint8_t *)0x4000 + ((col & 31) << 8) + target->y + at.ty) = byte;
        if(++at.tx == target->width) {
            at.tx = 0;
            at.ty++;
        }
        return;
    }

    if(at.palette != NXI_PALETTE) {
        if(at.palette++ & 1) {
            ZXN_NEXTREGA(0x44, paletteByte);
            ZXN_NEXTREGA(0x44, byte & 0x01);
        } else {
            paletteByte = byte;
        }
        return;
    }
    if(at.page == LAYER2_PAGES) return;
    *at.pixel++ = byte;
    if(at.pixel == (uint8_t *)0x6000) {
        at.pixel = (uint8_t *)0x4000;
        if(++at.page != LAYER2_PAGES) map();
    }
}

static void block(uint16_t length) __z88dk_fastcall {
    struct l2_place start;
    uint8_t retries = 3;
    uint8_t sum;
    uint16_t count;
    unsigned char byte;

    memcpy(&start, &at, sizeof(at));
    while(1) {
        if(!target->width && at.palette != NXI_PALETTE) ZXN_NEXTREGA(0x40, at.palette >> 1);
        map();
        sum = 0;
        for(count = 0; count != length; count++) {
            byte = NET_GetUChar();
            sum += byte;
            put(byte);
        }
        if(NET_GetUChar() == sum) return;

        retries--;
        if(!retries) {
            NBN_PageOut();
            NBN_Fail(err_transfer_error);
        }
        memcpy(&at, &start, sizeof(at));
        NET_PutCh(NBN_BLOCK_FAIL);
        NET_Send("\x0D\x0A", 2);
    }
}

unsigned char *gui_get(struct l2_target *file) {
    unsigned char *error;
    uint32_t size;
    uint32_t blocks;
    uint16_t remainder;

    target = file;
    at.palette = file->width ? NXI_PALETTE : 0;
    at.page = file->width ? file->x >> 5 : 0;
    at.pixel = (uint8_t *)0x4000;
    at.tx = 0;
    at.ty = 0;

    if(file->width) sprintf(nbnBuff, "GET %s/thumb/%s/%u\x0A", username, appid, file->slot);
    else sprintf(nbnBuff, "GET %s/nxi/%s/%u\x0A", username, appid, file->slot);
    NET_Send(nbnBuff, strlen(nbnBuff));

    if((error = check_version())) return error;
    NET_GetUInt32((uint8_t *)&size);
    NET_GetUInt32((uint8_t *)&blocks);
    NET_GetUInt16((uint8_t *)&remainder);
    while(NET_GetUChar());

    ZXN_NEXTREG(0x43, 0x10);
    for(; blocks; blocks--) {
        NET_PutCh(NBN_BLOCK_SUCCESS);
        NET_Send("\x0D\x0A", 2);
        block(NBN_MAX_BLOCKSIZE);
    }
    NET_Send("!", 1);
    NET_Send("\x0D\x0A", 2);
    block(remainder);
    NET_PutCh(NBN_BLOCK_SUCCESS);
    NET_Send("\x0D\x0A", 2);

    NBN_PageOut();
    return NULL;
}
