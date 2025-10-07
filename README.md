# imgforge

A Bash-based wizard for customizing and flashing OS images for Raspberry Pi, Radxa Zero3, and NVIDIA Jetson devices.
It lets you set hostname, Wi-Fi credentials, SSH access, users, Docker, and even run custom install scripts inside the image before first boot.

---

## Features

- Flash raw `.img` files to removable devices
- Expand root filesystem partition size
- Set hostname and root password
- Change default username (e.g. `pi` → custom user)
- Configure **Wi-Fi** headlessly via `wpa_supplicant.conf`
- Enable SSH automatically on first boot
- Preload a `docker-compose.yml` and install Docker
- Run arbitrary install scripts (local file or inline command) inside the image before first boot
- Works with:
  - Raspberry Pi OS
  - Radxa Zero3 (Ubuntu/Debian images)
  - NVIDIA Jetson (via `Linux_for_Tegra` + `flash.sh`)

---

## Usage

```bash
./image-builder.sh
```

You’ll be prompted for:

```
1. Mode
   - 1 = Flash a device immediately
   - 2 = Create a reproducible customized image artifact

2. Board type
   - 1 = Raspberry Pi / Radxa (.img)
   - 2 = NVIDIA Jetson (Linux_for_Tegra flash.sh)

3. Customizations
   - Hostname
   - Root password
   - Username (rename pi to another user)
   - Wi-Fi credentials
   - Enable SSH
   - Preload Docker Compose project
   - Run custom script (local file or inline command)

```
When finished:

- Mode 2 produces a custom.img ready to flash.
- Mode 1 writes the .img directly to your chosen removable device (e.g. /dev/sdX).

## Wi-Fi
Wi-Fi is configured headlessly by writing /etc/wpa_supplicant/wpa_supplicant.conf inside the image:
```conf
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=DE

network={
    ssid="YourSSID"
    psk="YourPassword"
    key_mgmt=WPA-PSK
}
```

## SSH
- SSH daemon is enabled automatically.
- If you provide Wi-Fi credentials, you can SSH into the device headlessly after first boot.
- If you run a custom script such as install-node.sh, it will create its own user (make87) and generate keys for that user.


## last-run.env

The wizard saves your last answers in a file called last-run.env.
This lets you rerun the script without re-entering everything.

Example:
```ini
HOSTNAME=radxa-node
CHANGE_USERNAME=y
NEW_USERNAME=customuser
SET_ROOTPW=y
ROOTPW=secret
ENABLE_SSH=y
WIFI_CHOICE=1
WIFI_SSID=MyWiFi
WIFI_PASS=SuperSecretPass
BOARD=1
IMG_CHOICE=3
```

You can edit this file manually if you want to change defaults between runs. If the file exists, the wizard will offer to reuse the saved configuration automatically.
