NAME ?= spun
COMMON ?= ../../vendor/NBNtools/clients/common
UNZIP ?= ../unzip
UNZIP_BANK ?= 33

# A build named <name> (make NAME=<name> zip) reads its settings from .env.<name> (gitignored):
#   DISPLAY_NAME  the name the user sees (default: NAME in capitals)
#   SERVER, PORT  the default server
#   UPDATE_ID     the app id of the build itself on that server, for the self-update (default: NAME)
#   THEME_COLOUR  the 8-bit colour that takes the place of the SPUN blue in PALETTE (default 0x02, the FoaK
#                 blue). The CMS's web theme takes the same byte, as THEME_COLOUR in docker/.env
#   PALETTE       the tilemap's paper and ink pairs, in 8-bit colour, for the ATTR_ values in gui/gui.h
-include .env.$(NAME)
DISPLAY_NAME ?= $(shell echo '$(NAME)' | tr a-z A-Z)
SERVER ?= s1.zx.immo
PORT ?= 48128
UPDATE_ID ?= $(NAME)
THEME_COLOUR ?= 0x02
PALETTE ?= $(THEME_COLOUR),0xFF,$(THEME_COLOUR),0xFC,0xFF,$(THEME_COLOUR),0xFF,0xE0,0xE3,0xE3,0xFF,0x00,0x49,0x92

# A build for a server given on the command line goes to BUILD-dev, so it never overwrites the release build
ifeq ($(filter command line,$(origin SERVER) $(origin PORT)),)
BUILD_DIR ?= ./BUILD-$(NAME)
else
BUILD_DIR ?= ./BUILD-dev
endif

# Each build has its own objects and link output, so builds for different servers never mix and can run at once
TMP_DIR ?= $(dir $(BUILD_DIR))TMP-$(patsubst BUILD-%,%,$(notdir $(BUILD_DIR)))

VERSION := $(shell cat ../VERSION)

# The release zip: the dot command as <name>.dot, then these files, all at the zip's root.
# Only the spun build's zip has spunzip.dot too
ZIP := $(BUILD_DIR)/$(NAME)-$(VERSION).zip
SPUNZIP_DIR := ../spunzip
ZIP_SPUNZIP := $(if $(filter spun,$(NAME)),spunzip)
BAS := $(BUILD_DIR)/$(NAME).bas
ZIP_FILES := $(BUILD_DIR)/README.txt $(BUILD_DIR)/$(NAME).gde $(BAS)
TXT2BAS ?= txt2bas

# Text with the product name in it: SPUN becomes DISPLAY_NAME and spun becomes NAME
NAMED = sed -e 's/SPUN/$(DISPLAY_NAME)/g' -e 's/spun/$(NAME)/g'
NAMED_DEPS := Makefile $(wildcard .env.$(NAME))

CRT := 30

# z88dk runs in its Docker image, with src/ mounted at the same path, so relative and absolute paths both work
SRC_ROOT := $(abspath ../..)
Z88DK_IMAGE ?= z88dk/z88dk:latest
Z88DK_RUN = docker run --rm --user $(shell id -u):$(shell id -g) -e HOME=/tmp -v $(SRC_ROOT):$(SRC_ROOT) -w $(1) $(Z88DK_IMAGE)

ZOPT ?= --max-allocs-per-node200000
CC=$(call Z88DK_RUN,$(CURDIR)) zcc
CCFLAGS=+zxn -vn -startup=$(CRT) -clib=sdcc_iy -SO3 $(ZOPT) --opt-code-size -pragma-include:$(CURDIR)/zpragma.inc '-DSPUN_VERSION="$(VERSION)"' '-DSPUN_NAME="$(NAME)"' \
	'-DSPUN_DISPLAY="$(DISPLAY_NAME)"' '-DSPUN_UPDATE_ID="$(UPDATE_ID)"' '-DSPUN_PALETTE=$(PALETTE)'
LDFLAGS=-m
# Main ends below the stack, which starts at $BFD8 (zpragma.inc) with 1K reserved;
# above it are the mouse variables and the IM2 table (gui/isr.asm).
# appmake fails the build if data or BSS reaches the fence.
CZFLAGS=-Cz"--fullsize --main-fence 0xBBD8"
DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"' -Ddotn -DUNZIP_BANK=$(UNZIP_BANK) -Cm-DUNZIP_BANK=$(UNZIP_BANK) -Ca-I$(abspath $(UNZIP))

MKDIR := mkdir -p
RM := rm -rfv
MV := mv

POSIX_DIR ?= ./BUILD-posix
POSIX_CC ?= cc
POSIX_CFLAGS ?= -O2 -Wall -Wno-pointer-sign
POSIX_DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"' '-DSPUN_VERSION="$(VERSION)"' '-DSPUN_NAME="$(NAME)"' \
	'-DSPUN_DISPLAY="$(DISPLAY_NAME)"' '-DSPUN_UPDATE_ID="$(UPDATE_ID)"'
POSIX_SRC := spun.c common/file.c $(filter-out BANK_net/gui_%.c,$(wildcard BANK_net/*.c)) BANK_packages/catalogue.c BANK_packages/install.c BANK_packages/usage.c BANK_deps/deps.c \
	unzip_posix.c $(COMMON)/nbn.c $(COMMON)/nbn_pages.c $(COMMON)/net_posix.c $(COMMON)/posix.c
POSIX_LIBZIP := $(shell pkg-config --cflags --libs libzip)
POSIX_GEN := $(POSIX_DIR)/messages.c $(POSIX_DIR)/spun_messages.c $(POSIX_DIR)/help.c

all: binaries

clean:
	$(RM) $(BUILD_DIR)
	$(RM) $(TMP_DIR)
	$(RM) $(POSIX_DIR)
	$(RM) $(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin

dirs:
	$(MKDIR) $(BUILD_DIR)
	$(MKDIR) $(TMP_DIR)

# make compiles a bank again only when a file it is built from is newer than its object.
# Any header, the build settings or this Makefile make every bank compile again
lst_files = $(1) $(addprefix $(dir $(1)),$(shell cat $(1)))
HEADERS := $(wildcard *.h */*.h $(COMMON)/*.h $(UNZIP)/*.h)
DEPS := $(HEADERS) zpragma.inc ../VERSION Makefile $(wildcard .env.$(NAME))

# BANK_PACKAGES
$(TMP_DIR)/BANK_packages.o: $(call lst_files,BANK_packages/packages.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_46 --constsegBANK_46 \
		--datasegBANK_46 --bsssegBANK_46   \
		@BANK_packages/packages.lst -o$@

# BANK_DEPS: the walk of an app's dependencies, with room for a whole tree
$(TMP_DIR)/BANK_deps.o: $(call lst_files,BANK_deps/deps.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_45 --constsegBANK_45 \
		--datasegBANK_45 --bsssegBANK_45   \
		@BANK_deps/deps.lst -o$@

# BANK_GUI: the GUI's own code, the modal boxes and the network code. The NBNtools code's BSS (nbnBuff)
# stays in main, where main and every bank reach it
$(TMP_DIR)/BANK_gui.o: $(call lst_files,BANK_gui/gui.lst) $(call lst_files,BANK_ui/ui.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 \
		--datasegBANK_44 --bsssegBANK_44   \
		@BANK_gui/gui.lst @BANK_ui/ui.lst -o$@

# BANK_SCREEN: the screen set-up (layers, font, NextZXOS's back) and the splash
$(TMP_DIR)/BANK_screen.o: $(call lst_files,BANK_screen/screen.lst) BANK_screen/specp437_128-255.bin $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_41 --constsegBANK_41 \
		--datasegBANK_41 --bsssegBANK_41   \
		@BANK_screen/screen.lst -o$@

$(TMP_DIR)/BANK_net.o: $(call lst_files,BANK_net/net.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 \
		--datasegBANK_44 --bsssegBANK_44   \
		@BANK_net/net.lst -o$@

$(TMP_DIR)/BANK_net_nbn.o: $(call lst_files,BANK_net/nbn.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 --datasegBANK_44 \
		@BANK_net/nbn.lst -o$@

# BANK_APP: the GUI's app page
$(TMP_DIR)/BANK_app.o: $(call lst_files,BANK_app/app.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_42 --constsegBANK_42 \
		--datasegBANK_42 --bsssegBANK_42   \
		@BANK_app/app.lst -o$@

# BANK_SPRITES: the sprite sheet, data only
$(TMP_DIR)/BANK_sprites.o: $(call lst_files,BANK_sprites/sprites.lst) BANK_sprites/ui.spr $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c @BANK_sprites/sprites.lst -o$@

bank_46: $(TMP_DIR)/BANK_packages.o
bank_45: $(TMP_DIR)/BANK_deps.o
bank_44: $(TMP_DIR)/BANK_gui.o $(TMP_DIR)/BANK_net.o $(TMP_DIR)/BANK_net_nbn.o
bank_43: $(TMP_DIR)/BANK_sprites.o
bank_42: $(TMP_DIR)/BANK_app.o
bank_41: $(TMP_DIR)/BANK_screen.o

banks: bank_46 bank_45 bank_44 bank_43 bank_42 bank_41

BANK_OBJS := $(addprefix $(TMP_DIR)/BANK_,net.o net_nbn.o packages.o deps.o gui.o screen.o sprites.o app.o)

# Run inside $(UNZIP): INCLUDE resolves from the current directory
$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin: $(UNZIP)/inflate.asm $(UNZIP)/inflate_job.inc
	$(call Z88DK_RUN,$(abspath $(UNZIP))) z88dk-z80asm -mz80n -b inflate.asm
	rm -f $(UNZIP)/inflate.o $(UNZIP)/inflate.bin

# The help and the messages name the build, so main takes copies from TMP_DIR. BINARY reads from the
# current directory, so the copy of help.asm names its help.txt by absolute path
$(TMP_DIR)/help.txt: help.txt $(NAMED_DEPS) | dirs
	$(NAMED) $< > $@

$(TMP_DIR)/spun_messages.asm: spun_messages.asm $(NAMED_DEPS) | dirs
	$(NAMED) $< > $@

$(TMP_DIR)/help.asm: help.asm Makefile | dirs
	sed 's|"help.txt"|"$(abspath $(TMP_DIR))/help.txt"|' $< > $@

# Main: the server and port are compiled in here only
$(TMP_DIR)/main.o: $(call lst_files,spun.lst) $(addprefix $(TMP_DIR)/,help.txt help.asm spun_messages.asm) \
		$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin $(UNZIP)/inflate_job.inc $(DEPS) | dirs
	$(CC) $(CCFLAGS) $(DEFINES) -c @spun.lst $(TMP_DIR)/spun_messages.asm $(TMP_DIR)/help.asm -o$@

# appmake names a dot command from the first 8 characters of -o, in capitals, so the link runs inside TMP_DIR
$(BUILD_DIR)/$(NAME): $(TMP_DIR)/main.o $(BANK_OBJS) | dirs
	$(call Z88DK_RUN,$(abspath $(TMP_DIR))) zcc $(CCFLAGS) $(LDFLAGS) $(DEFINES) main.o $(notdir $(BANK_OBJS)) -o$(NAME) -create-app -subtype=dotn $(CZFLAGS)
	$(MV) $(TMP_DIR)/$(NAME) $@

dotn: $(BUILD_DIR)/$(NAME)

binaries: dotn

# The menu runs the dot command it was zipped with
$(BAS): ../zip/spun.txt $(NAMED_DEPS) | dirs
	$(NAMED) $< > $(TMP_DIR)/spun.txt
	$(TXT2BAS) -i $(TMP_DIR)/spun.txt -o $@

$(BUILD_DIR)/README.txt: ../zip/README.txt $(NAMED_DEPS) | dirs
	$(NAMED) $< > $@

$(BUILD_DIR)/$(NAME).gde: ../zip/spun.gde $(NAMED_DEPS) | dirs
	$(NAMED) $< > $@

spunzip:
	$(MAKE) -C $(SPUNZIP_DIR)

zip: binaries $(ZIP_SPUNZIP) $(ZIP_FILES)
	$(RM) $(BUILD_DIR)/zip $(ZIP)
	$(MKDIR) $(BUILD_DIR)/zip
	cp $(BUILD_DIR)/$(NAME) $(BUILD_DIR)/zip/$(NAME).dot
	$(if $(ZIP_SPUNZIP),cp $(SPUNZIP_DIR)/BUILD/spunzip $(BUILD_DIR)/zip/spunzip.dot)
	cp $(ZIP_FILES) $(BUILD_DIR)/zip/
	cd $(BUILD_DIR)/zip && zip -X -q $(abspath $(ZIP)) $(NAME).dot $(addsuffix .dot,$(ZIP_SPUNZIP)) $(notdir $(ZIP_FILES))
	$(RM) $(BUILD_DIR)/zip

posix: $(POSIX_DIR)/$(NAME)

$(POSIX_DIR)/$(NAME): $(POSIX_SRC) $(POSIX_GEN) $(COMMON)/*.h *.h common/*.h BANK_*/*.h $(UNZIP)/unzip.h ../VERSION
	$(POSIX_CC) $(POSIX_CFLAGS) $(POSIX_DEFINES) -o $@ $(POSIX_SRC) $(POSIX_GEN) $(POSIX_LIBZIP)

$(POSIX_DIR)/messages.c: $(COMMON)/messages.asm $(COMMON)/messages2c.awk
	$(MKDIR) $(POSIX_DIR)
	awk -f $(COMMON)/messages2c.awk $(COMMON)/messages.asm > $@

$(POSIX_DIR)/spun_messages.c: spun_messages.asm $(COMMON)/messages2c.awk $(NAMED_DEPS)
	$(MKDIR) $(POSIX_DIR)
	$(NAMED) spun_messages.asm | awk -f $(COMMON)/messages2c.awk > $@

# The same file help.asm includes with BINARY
$(POSIX_DIR)/help.c: help.txt $(NAMED_DEPS)
	$(MKDIR) $(POSIX_DIR)
	( echo "unsigned char help[] = {"; $(NAMED) help.txt | xxd -i; echo ", 0 };" ) > $@

.DELETE_ON_ERROR:

.PHONY: all clean dirs banks bank_46 bank_45 bank_44 bank_43 bank_42 dotn binaries spunzip zip posix
