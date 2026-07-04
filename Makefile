BOARD := thingy91/nrf9160/ns
DEVICE := NRF9160_XXAA
SNR := 50119503
NCS_TOOLCHAIN := /opt/nordic/ncs/toolchains/b8efef2ad5
APP_DIR := hello-world

export PATH := $(NCS_TOOLCHAIN)/bin:$(NCS_TOOLCHAIN)/Cellar/ninja/1.10.2/bin:$(NCS_TOOLCHAIN)/Cellar/python@3.12/3.12.4/Frameworks/Python.framework/Versions/3.12/bin:$(PATH)
export ZEPHYR_BASE := /opt/nordic/ncs/v2.9.0/zephyr

.PHONY: build clean rebuild flash monitor rtt-server rtt-client recover all

build:
	cd $(APP_DIR) && west build -b $(BOARD)

clean:
	cd $(APP_DIR) && rm -rf build

rebuild:
	cd $(APP_DIR) && west build -b $(BOARD) -p

flash:
	cd $(APP_DIR) && west flash

recover:
	nrfjprog --recover -f NRF91 --snr $(SNR)

# Starts J-Link commander with RTT server — run in its own terminal
rtt-server:
	JLinkExe -Device $(DEVICE) -If SWD -Speed 4000 -AutoConnect 1

# Connects to the RTT server — run in a second terminal after rtt-server
rtt-client:
	JLinkRTTClient

# Opens the GUI RTT Viewer (standalone, no separate server needed)
monitor:
	open /Applications/SEGGER/JLink_V924a/JLinkRTTViewer.app

all: rebuild flash
	@echo ""
	@echo "Flash complete. To see output, run in two terminals:"
	@echo "  Terminal 1: make rtt-server"
	@echo "  Terminal 2: make rtt-client"
