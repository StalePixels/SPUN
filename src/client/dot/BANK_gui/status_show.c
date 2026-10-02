#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

void status_show(void) {
    unsigned char line[GUI_COLUMNS];

    if(*searchText && !totalItems) sprintf(line, "Search \"%s\": 0 found", searchText);
    else if(*searchText) sprintf(line, "Search \"%s\": %u found, page %u of %u", searchText, totalItems, page, totalPages);
    else sprintf(line, "Catalogue: %u apps, page %u of %u", totalItems, page, totalPages);
    tm_text(1, STATUS_ROW, line, ATTR_TEXT);
}
