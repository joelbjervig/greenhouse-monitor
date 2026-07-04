# Development Guide — Greenhouse IoT (Thingy:91)

## Prerequisites

- nRF Connect SDK v2.9.0 installed at `/opt/nordic/ncs/v2.9.0/`
- SEGGER J-Link tools installed
- Thingy:91 connected via J-Link Base (10-pin SWD cable)
- Thingy:91 power switch set to ON

## Environment Setup

Run this in every new terminal session (or add to your shell profile):

```bash
export PATH="/opt/nordic/ncs/toolchains/b8efef2ad5/bin:/opt/nordic/ncs/toolchains/b8efef2ad5/Cellar/ninja/1.10.2/bin:/opt/nordic/ncs/toolchains/b8efef2ad5/Cellar/python@3.12/3.12.4/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
source /opt/nordic/ncs/v2.9.0/zephyr/zephyr-env.sh
```

## Build

```bash
cd hello-world
west build -b thingy91/nrf9160/ns
```

Pristine rebuild (after changing config or includes):

```bash
west build -b thingy91/nrf9160/ns -p
```

## Flash

```bash
west flash
```

## Monitor RTT Output

Option A — GUI (easiest):

```bash
JLinkRTTViewer
```

Option B — CLI (two terminals):

```bash
# Terminal 1: Start GDB server (includes RTT server)
JLinkGDBServer -Device NRF9160_XXAA -If SWD -Speed 4000

# Terminal 2: Connect RTT client
JLinkRTTClient
```

## Quick Reference

| Action | Command |
|--------|---------|
| Build | `west build -b thingy91/nrf9160/ns` |
| Clean build | `west build -b thingy91/nrf9160/ns -p` |
| Flash | `west flash` |
| Monitor | `JLinkRTTViewer` |
| Build + Flash | `west build -b thingy91/nrf9160/ns && west flash` |

## Troubleshooting

- **"Low voltage 0 detected"** — Thingy:91 power switch is OFF or battery is dead
- **"ccache/ninja not found"** — Environment PATH not set up (see above)
- **RTT shows nothing** — Press reset button on Thingy:91 after connecting RTT
- **Build dir conflicts** — Delete `build/` folder and rebuild
