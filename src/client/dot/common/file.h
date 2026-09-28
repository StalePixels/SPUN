#ifndef SPUN_FILE_H
#define SPUN_FILE_H

#include <stdbool.h>
#include <stdint.h>

extern unsigned char file_out;
extern unsigned char file_in;

void file_check(void);
bool open_in(unsigned char *name) __z88dk_fastcall;
void close_in(void);
void create_out(unsigned char *name) __z88dk_fastcall;
void close_out(void);
void write_out(void *text, uint16_t length);
bool read_byte(unsigned char *chr) __z88dk_fastcall;
bool remove_file(unsigned char *name) __z88dk_fastcall;

#endif
