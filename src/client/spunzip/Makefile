# .spunzip: SPUN's unzipper (../unzip) on its own, with the stock .UNZIP's switches.
# UNZIP_NO_DOTS leaves out .spun's install of .dot files into C:/dot.
UNZIP := ../unzip
UNZIP_BANK ?= 33
BUILD_DIR ?= ./BUILD
TMP_DIR ?= ./TMP

SRC_ROOT := $(abspath ../..)
Z88DK_IMAGE ?= z88dk/z88dk:latest
Z88DK_RUN = docker run --rm --user $(shell id -u):$(shell id -g) -e HOME=/tmp -v $(SRC_ROOT):$(SRC_ROOT) -w $(1) $(Z88DK_IMAGE)

CCFLAGS = +zxn -vn -startup=30 -clib=sdcc_iy -SO3 --opt-code-size -pragma-include:$(CURDIR)/zpragma.inc \
	-Ddotn -DUNZIP_NO_DOTS -DUNZIP_BANK=$(UNZIP_BANK) -Cm-DUNZIP_BANK=$(UNZIP_BANK) -Ca-I$(abspath $(UNZIP)) -m
SRC := spunzip.c $(UNZIP)/unzip.c $(UNZIP)/unzip_pages.c $(UNZIP)/unzip_stub.asm $(UNZIP)/inflate_pages.asm.m4

all: $(BUILD_DIR)/spunzip

$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin: $(UNZIP)/inflate.asm $(UNZIP)/inflate_job.inc
	$(call Z88DK_RUN,$(abspath $(UNZIP))) z88dk-z80asm -mz80n -b inflate.asm
	rm -f $(UNZIP)/inflate.o $(UNZIP)/inflate.bin

# appmake names a dot command from the first 8 characters of -o, in capitals, so the link runs inside TMP_DIR
$(BUILD_DIR)/spunzip: $(SRC) $(wildcard $(UNZIP)/*.h) $(UNZIP)/inflate_job.inc zpragma.inc Makefile \
		$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin
	mkdir -p $(BUILD_DIR) $(TMP_DIR)
	$(call Z88DK_RUN,$(abspath $(TMP_DIR))) zcc $(CCFLAGS) $(addprefix $(CURDIR)/,$(SRC)) -ospunzip -create-app -subtype=dotn
	mv $(TMP_DIR)/spunzip $@

clean:
	rm -rf $(BUILD_DIR) $(TMP_DIR)

.PHONY: all clean
