#ifndef SPUN_INSTALL_H
#define SPUN_INSTALL_H

extern unsigned char *unzipErrors[];

unsigned char install(char *id) __z88dk_fastcall;
unsigned char *spun_get(char *id);
unsigned char *spun_update(void);
unsigned char *install_check(char *id);
unsigned char *gui_install(char *id);
uint16_t updates_count(void);

#endif
