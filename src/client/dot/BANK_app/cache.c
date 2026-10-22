#include "../common/spun.h"
#include "../gui/gui.h"
#include "app.h"
#include "cache.h"

// Thumbnails are indexes 0 to 4, NXI files 5 to 9
static void cache_path(unsigned char *path, uint8_t index) {
    if(index == CACHE_SLOTS) sprintf(path, "C:/tmp/spun/%s/cache.crc", appid);
    else if(index < SLOTS) sprintf(path, "C:/tmp/spun/%s/thumb%u", appid, index + 1);
    else sprintf(path, "C:/tmp/spun/%s/shot%u", appid, index - SLOTS + 1);
}

static void cache_save(void) {
    unsigned char path[32];
    uint8_t handle;

    cache_path(path, CACHE_SLOTS);
    errno = 0;
    handle = esxdos_f_open(path, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    if(errno) return;
    esxdos_f_write(handle, cacheCrc, sizeof(cacheCrc));
    esxdos_f_close(handle);
}

static void cache_unlink(uint8_t index) __z88dk_fastcall {
    unsigned char path[32];

    cache_path(path, index);
    esxdos_f_unlink(path);
}

// A missing or short cache.crc counts as all zeros
void cache_load(void) {
    unsigned char path[32];
    uint8_t handle;

    memset(cacheCrc, 0, sizeof(cacheCrc));
    cache_path(path, CACHE_SLOTS);
    errno = 0;
    handle = esxdos_f_open(path, ESXDOS_MODE_R);
    if(errno) return;
    if(esxdos_f_read(handle, cacheCrc, sizeof(cacheCrc)) != sizeof(cacheCrc)) memset(cacheCrc, 0, sizeof(cacheCrc));
    esxdos_f_close(handle);
}

// Sets file_in to read the cached file, or file_out to write the download to it. A file that is
// about to change loses its value in cache.crc first, so cache.crc never names an incomplete file
void cache_open(uint8_t index) {
    unsigned char path[32];
    uint8_t handle;

    file_in = 0;
    file_out = 0;
    if(!shotCrc[index]) return;

    cache_path(path, index);
    if(shotCrc[index] == cacheCrc[index]) {
        errno = 0;
        handle = esxdos_f_open(path, ESXDOS_MODE_R);
        if(!errno) {
            file_in = handle;
            return;
        }
    }
    if(cacheCrc[index]) {
        cacheCrc[index] = 0;
        cache_save();
    }

    strcpy(nbnBuff, "C:/tmp/spun");
    esx_f_mkdir(nbnBuff);
    sprintf(nbnBuff, "C:/tmp/spun/%s", appid);
    esx_f_mkdir(nbnBuff);
    errno = 0;
    handle = esxdos_f_open(path, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    if(!errno) file_out = handle;
}

// gui_get closes file_out itself if a write fails
void cache_close(uint8_t index, bool complete) {
    if(file_in) esxdos_f_close(file_in);
    file_in = 0;
    if(!file_out) return;

    esxdos_f_close(file_out);
    file_out = 0;
    if(!complete) return;
    cacheCrc[index] = shotCrc[index];
    cache_save();
}

// For a slot the server no longer lists
void cache_drop(uint8_t slot) __z88dk_fastcall {
    if(!cacheCrc[slot - 1] && !cacheCrc[SLOTS + slot - 1]) return;

    cache_unlink(slot - 1);
    cache_unlink(SLOTS + slot - 1);
    cacheCrc[slot - 1] = 0;
    cacheCrc[SLOTS + slot - 1] = 0;
    cache_save();
}

void cache_clear(void) {
    uint8_t index;

    for(index = 0; index <= CACHE_SLOTS; index++) cache_unlink(index);
    sprintf(nbnBuff, "C:/tmp/spun/%s", appid);
    esx_f_rmdir(nbnBuff);
    memset(cacheCrc, 0, sizeof(cacheCrc));
}
