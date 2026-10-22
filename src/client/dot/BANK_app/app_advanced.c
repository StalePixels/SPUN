#include "../common/spun.h"
#include "../gui/gui.h"
#include "app.h"
#include "cache.h"

static const struct modal_button advancedButtons[] = { { 'l', "Clear cache", INK_YELLOW }, { 'c', "Cancel", INK_RED } };

void app_advanced(void) {
    if(modal_ask((const unsigned char *)"Advanced", NULL, 0, advancedButtons, 2) != 0) return;

    intrinsic_di();
    pointer_hide();
    cache_clear();
    intrinsic_ei();
}
