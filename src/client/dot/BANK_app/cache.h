#ifndef SPUN_CACHE_H
#define SPUN_CACHE_H

#include <stdint.h>
#include <stdbool.h>

void cache_load(void);
void cache_open(uint8_t index);
void cache_close(uint8_t index, bool complete);
void cache_drop(uint8_t slot) __z88dk_fastcall;
void cache_clear(void);

#endif
