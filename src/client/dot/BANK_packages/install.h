#ifndef SPUN_INSTALL_H
#define SPUN_INSTALL_H

extern unsigned char *unzipErrors[];

unsigned char install(char *id, bool yes);
unsigned char *dir_make(void);
unsigned char *spun_get(char *id);
unsigned char *spun_update(void);
void self_update(char *name);
unsigned char *install_check(char *id);
void install_start(void);
unsigned char *deps_first(void);
unsigned char *dep_install(char *id);
unsigned char *dep_dir(char *id);
unsigned char *gui_install(char *id);
uint16_t updates_count(void);

#endif
