#ifndef SPUN_NET_H
#define SPUN_NET_H

#include <stdint.h>

// Where gui_get puts a file in Layer 2: a thumbnail of width x height at x, y of 320x256 Layer 2,
// or with width 0 an NXI, whose palette goes to the Layer 2 palette and its pixels from the start of Layer 2
struct l2_target {
    uint8_t slot;
    uint8_t width;
    uint8_t height;
    uint8_t y;
    uint16_t x;
};

void net_open(void);
void net_close(void);
unsigned char *spun_find(char *text);
unsigned char *spun_info(char *id);
unsigned char *send_info(char *id) __z88dk_fastcall;
unsigned char *latest(char *id);
unsigned char *download(char *id);
void print_wrapped(unsigned char *text) __z88dk_fastcall;
unsigned char *page_request(unsigned char *text);
unsigned char *reply_next_app(void);

unsigned char *gui_app_at(uint16_t index);
unsigned char *gui_info(void);
unsigned char *gui_next_release(void);
unsigned char *gui_release_at(uint16_t index);
unsigned char *gui_clog(void);
unsigned char *gui_get(struct l2_target *target);

#endif
