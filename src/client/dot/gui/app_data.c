#include "../common/spun.h"
#include "gui.h"
#include "../BANK_net/net.h"
#include "../BANK_app/app.h"

uint16_t shotWidth[SLOTS];
unsigned char categoryText[96];
uint16_t releaseCount;
uint8_t releaseRows;
unsigned char changelog[CHANGELOG_LENGTH + 1];
uint16_t updateCount;
uint8_t installCase;
