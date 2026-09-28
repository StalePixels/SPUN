#include "spun.h"

unsigned char file_out;
unsigned char file_in;

void file_check(void) {
    if(errno) exit(errno);
}

bool open_in(unsigned char *name) __z88dk_fastcall {
    uint8_t handle;

    errno = 0;
    handle = esxdos_f_open(name, ESXDOS_MODE_R);
    if(errno == NOT_FOUND) return false;
    file_check();

    file_in = handle;
    return true;
}

void close_in(void) {
    errno = 0;
    esxdos_f_close(file_in);
    file_in = 0;
    file_check();
}

void create_out(unsigned char *name) __z88dk_fastcall {
    uint8_t handle;

    errno = 0;
    handle = esxdos_f_open(name, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    file_check();
    file_out = handle;
}

void close_out(void) {
    errno = 0;
    esxdos_f_close(file_out);
    file_out = 0;
    file_check();
}

void write_out(void *text, uint16_t length) {
    errno = 0;
    esxdos_f_write(file_out, text, length);
    file_check();
}

bool read_byte(unsigned char *chr) __z88dk_fastcall {
    int got;

    errno = 0;
    got = esxdos_f_read(file_in, chr, 1);
    file_check();

    return got;
}

bool remove_file(unsigned char *name) __z88dk_fastcall {
    errno = 0;
    esxdos_f_unlink(name);
    if(errno == NOT_FOUND) return false;
    file_check();

    return true;
}
