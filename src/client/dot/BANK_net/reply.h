#ifndef SPUN_REPLY_H
#define SPUN_REPLY_H

// The tagged fields of SPFIND, SPLIST, SPINFO and SPCLOG replies. Tags from
// REPLY_LONG_TAG have a u16 length, the others a u8 length.
#define SPUN_FORMAT_VERSION 1

#define REPLY_LONG_TAG      0x80

#define TAG_TOTAL           0x01
#define TAG_PAGE            0x02
#define TAG_PAGES           0x03
#define TAG_APP             0x10
#define TAG_APP_ID          0x11
#define TAG_USERNAME        0x12
#define TAG_TITLE           0x13
#define TAG_SERIAL          0x14
#define TAG_VERSION         0x15
#define TAG_DOWNLOADS       0x16
#define TAG_DATE            0x17
#define TAG_RELEASE         0x18
#define TAG_CATEGORY        0x19
#define TAG_SCREENSHOT      0x1A
#define TAG_SLOT            0x1B
#define TAG_WIDTH           0x1C
#define TAG_DESCRIPTION     0x80
#define TAG_CHANGELOG       0x81

extern uint16_t replySize;
extern uint16_t replyEnd;
extern uint16_t replyNext;
extern uint16_t replyValue;
extern uint8_t replyTag;
extern uint16_t replyLength;

extern unsigned char description[257];
extern unsigned char date[11];

unsigned char *check_version(void);
unsigned char *reply_request(void);
void reply_rewind(void);
bool reply_field(void);
uint16_t reply_enter(void);
void reply_leave(uint16_t end) __z88dk_fastcall;
unsigned char reply_byte(void);
uint32_t reply_number(void);
void reply_text(unsigned char *dest, uint16_t size);
void reply_counts(void);
void reply_app(void);
void reply_release(void);

#endif
