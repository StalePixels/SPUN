#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "run.h"

// A search in a category can be longer than the screen is wide, so the line is cut
void status_show(void) {
    unsigned char line[GUI_COLUMNS + SEARCH_LENGTH];
    unsigned char *at = line;

    if(categoriesShown) {
        at += sprintf(at, "Categories: %u", totalItems);
    } else if(*searchText) {
        at += sprintf(at, "Search \"%s\"", searchText);
        if(*categorySlug) at += sprintf(at, " in %s", categoryName);
        at += sprintf(at, ": %u found", totalItems);
    } else {
        at += sprintf(at, "%s: %u apps", *categorySlug ? categoryName : (unsigned char *)"Catalogue", totalItems);
    }
    if(totalItems || !*searchText || categoriesShown) sprintf(at, ", page %u of %u", page, totalPages);
    tm_cut(1, STATUS_ROW, line, GUI_COLUMNS - 2, ATTR_TEXT);
}
