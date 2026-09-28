#ifndef SPUN_NET_H
#define SPUN_NET_H

void net_open(void);
void net_close(void);
unsigned char *spun_find(char *text);
unsigned char *spun_info(char *id);
unsigned char *latest(char *id);
unsigned char *download(char *id);

#endif
