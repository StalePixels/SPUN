#ifndef SPUN_CATALOGUE_H
#define SPUN_CATALOGUE_H

extern unsigned char catalogue[];
extern unsigned char catalogueTemp[];
extern unsigned char entry[32 + 256];
extern unsigned char entryApp[7];
extern uint16_t entrySerial;
extern bool installed;
extern uint16_t installedSerial;

bool next_line(void);
uint8_t parse_entry(void);
int check_catalogue(char *id);
void write_catalogue(char *id) __z88dk_fastcall;

#endif
