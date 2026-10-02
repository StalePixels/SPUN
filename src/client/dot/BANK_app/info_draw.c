#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

void info_draw(void) {
    unsigned char line[12 + sizeof(categoryText)];
    uint8_t row = THUMB_Y / 8;

    tm_text(INFO_COL, row, (unsigned char *)"Downloads", ATTR_KEY);
    sprintf(line, "%lu", (unsigned long)downloads);
    tm_text(INFO_COL, row + 1, line, ATTR_TEXT);
    tm_text(INFO_COL, row + 3, (unsigned char *)"App id", ATTR_KEY);
    tm_text(INFO_COL, row + 4, appid, ATTR_TEXT);
    tm_text(INFO_COL, row + 6, (unsigned char *)"Releases", ATTR_KEY);
    sprintf(line, "%u", releaseCount);
    tm_text(INFO_COL, row + 7, line, ATTR_TEXT);

    row = TEXT_ROW;
    tm_text(1, row++, title, ATTR_KEY);
    sprintf(line, "by %s", username);
    tm_text(1, row++, line, ATTR_TEXT);
    sprintf(line, "Categories: %s", *categoryText ? categoryText : (unsigned char *)"none");
    row += text_wrap(line, 1, row, LEFT_WIDTH, 2);
    text_wrap(description, 1, row, LEFT_WIDTH, TEXT_END - row);
}
