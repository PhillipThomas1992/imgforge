#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
▘     ▐▘
▌▛▛▌▛▌▜▘▛▌▛▘▛▌█▌
▌▌▌▌▙▌▐ ▙▌▌ ▙▌▙▖
    ▄▌      ▄▌

=== Image Builder Wizard ===
EOF

WORKDIR=$(pwd)
STATE_FILE="last-run.env"

# -------------------------
# Helpers
# -------------------------
persist_var() {
    local key="$1" val="$2"
    grep -v "^${key}=" "$STATE_FILE" 2>/dev/null > "$STATE_FILE.tmp" || true
    mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
    echo "${key}=${val}" >> "$STATE_FILE"
}

list_safe_devices() {
    echo "Available removable devices:"
    lsblk -ndo NAME,SIZE,TYPE,MOUNTPOINT,HOTPLUG | awk '$3=="disk" && $5==1 {print "/dev/"$1, $2}'
}

ensure_curl() {
    command -v curl >/dev/null 2>&1 && return
    echo "Installing curl..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y curl
    elif command -v apk >/dev/null 2>&1; then
        sudo apk add curl
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y curl
    else
        echo "Please install curl manually."
        exit 1
    fi
}

ensure_tools() {
    command -v unzip >/dev/null 2>&1 || sudo apt-get install -y unzip
    command -v unxz  >/dev/null 2>&1 || sudo apt-get install -y xz-utils
    command -v qemu-aarch64-static >/dev/null 2>&1 || sudo apt-get install -y qemu-user-static
}

detect_init() {
    local MNT=$1
    if [[ -x "$MNT/bin/systemctl" || -x "$MNT/usr/bin/systemctl" ]]; then
        echo systemd
    else
        echo other
    fi
}

ensure_docker_in_image() {
    local MNT=$1
    echo "Installing Docker in image at $MNT ..."
    if [[ -x "$MNT/usr/bin/apt-get" ]]; then
        sudo chroot "$MNT" apt-get update
        sudo chroot "$MNT" apt-get install -y docker.io docker-compose-plugin
    elif [[ -x "$MNT/usr/bin/apk" ]]; then
        sudo chroot "$MNT" apk add docker docker-compose
    elif [[ -x "$MNT/usr/bin/dnf" ]]; then
        sudo chroot "$MNT" dnf install -y docker docker-compose
    else
        echo "Unsupported package manager inside image"
        return 1
    fi
    if [[ "$(detect_init "$MNT")" == "systemd" ]]; then
        sudo chroot "$MNT" systemctl enable docker || true
    fi
}

fsck_ext_relaxed() {
  # Usage: fsck_ext_relaxed /dev/loopXpY
  local dev="$1"
  # -f force, -y auto-fix
  sudo e2fsck -f -y "$dev"
  local rc=$?
  # 0 = clean, 1 = fixed issues (OK), >=2 = real error
  if (( rc >= 2 )); then
    echo "e2fsck failed on $dev (rc=$rc)." >&2
    exit $rc
  fi
}

expand_rootfs_in_img() {
  local img="$1"
  local add_bytes="$2"   # e.g. +2G or +4096M

  echo "Resizing image by $add_bytes ..."
  # 1) Enlarge the raw image
  truncate -s +"$add_bytes" "$img"

  # 2) Attach loop with partitions available
  local loop
  loop=$(sudo losetup -Pf --show "$img")

  # 3) Identify largest (rootfs) partition number
  local parts root_part root_num
  parts=$(lsblk -ln -o NAME,SIZE -b "$loop" | grep "^$(basename "$loop")p")
  root_part=$(echo "$parts" | sort -k2 -n | tail -1 | awk '{print $1}')
  root_num=$(echo "$root_part" | sed -E 's/.*p([0-9]+)$/\1/')

  echo "Growing partition p${root_num} to fill the image..."
  # 4) Grow the partition entry to the end
  printf ', +' | sudo sfdisk --force -N "$root_num" "$loop" >/dev/null

  # 5) Re-read partition table
  sudo partprobe "$loop" 2>/dev/null || true
  sudo losetup -c "$loop" 2>/dev/null || true

  local root_dev="/dev/$root_part"
  # kernel might rename the child, re-confirm
  local maybe_root
  maybe_root=$(lsblk -ln -o NAME "$loop" | grep "^$(basename "$loop")p$root_num$" || true)
  [[ -n "$maybe_root" ]] && root_dev="/dev/$maybe_root"

  # 6) If ext*, repair non-interactively and resize
  if sudo blkid -o value -s TYPE "$root_dev" | grep -q '^ext'; then
    echo "Checking filesystem on $root_dev ..."
    # -p = preen (auto-fix safe issues), -f = force check
    # e2fsck returns 1 when it fixed things; don't let set -e kill us.
    fsck_ext_relaxed "$root_dev"

    echo "Expanding filesystem on $root_dev ..."
    sudo resize2fs "$root_dev"
  else
    echo "Filesystem on $root_dev is not ext2/3/4; skipping resize2fs."
  fi

  # 7) Detach loop
  sudo losetup -d "$loop"
}


decompress_if_needed() {
    local FILE="$1"
    if [[ "$FILE" == *.xz ]]; then
        echo "Decompressing $FILE..." >&2
        unxz -k "$FILE"
        echo "${FILE%.xz}"
    elif [[ "$FILE" == *.gz ]]; then
        echo "Decompressing $FILE..." >&2
        gunzip -k "$FILE"
        echo "${FILE%.gz}"
    else
        echo "$FILE"
    fi
}

# -------------------------
# Customizations
# -------------------------
collect_customizations() {
    read -p "Enter hostname: " HOSTNAME
    persist_var HOSTNAME "$HOSTNAME"

    read -p "Change the default username? (y/n) " CHANGE_USERNAME
    persist_var CHANGE_USERNAME "$CHANGE_USERNAME"
    if [[ "${CHANGE_USERNAME:-n}" == "y" ]]; then
        read -p "Enter new username: " NEW_USERNAME
        persist_var NEW_USERNAME "$NEW_USERNAME"
    fi

    read -p "Set root password? (y/n) " SET_ROOTPW
    persist_var SET_ROOTPW "$SET_ROOTPW"
    if [[ "$SET_ROOTPW" == "y" ]]; then
        read -s -p "Enter root password: " ROOTPW; echo
        persist_var ROOTPW "$ROOTPW"
    fi

    read -p "Enable SSH on the device? (y/n) " ENABLE_SSH
    persist_var ENABLE_SSH "$ENABLE_SSH"

    read -p "Preload a docker-compose.yml? (y/n) " HAVE_COMPOSE
    persist_var HAVE_COMPOSE "$HAVE_COMPOSE"
    if [[ "$HAVE_COMPOSE" == "y" ]]; then
        read -p "Path to docker-compose.yml: " COMPOSE_FILE
        persist_var COMPOSE_FILE "$COMPOSE_FILE"
    fi

    read -p "Run a custom install script inside the image? (y/n) " HAVE_SCRIPT
    persist_var HAVE_SCRIPT "$HAVE_SCRIPT"
    if [[ "$HAVE_SCRIPT" == "y" ]]; then
        echo "Choose script type: "
        echo "1) File path "
        echo "2) Inline command"
        read -p "Choice [1/2]: " SCRIPT_TYPE
        persist_var SCRIPT_TYPE "$SCRIPT_TYPE"
        case $SCRIPT_TYPE in
            1) read -p "Path to custom script: " CUSTOM_SCRIPT
               CUSTOM_SCRIPT=$(realpath "$CUSTOM_SCRIPT")
               persist_var CUSTOM_SCRIPT "$CUSTOM_SCRIPT";;
            2) read -p "Enter inline command: " INLINE_COMMAND
               persist_var INLINE_COMMAND "$INLINE_COMMAND";;
        esac
    fi

    echo "Wi-Fi setup:"
    echo "1) Manual"
    echo "2) Pick local"
    echo "3) Skip"
    read -p "Choice [1/2/3]: " WIFI_CHOICE
    persist_var WIFI_CHOICE "$WIFI_CHOICE"
    case $WIFI_CHOICE in
        1) read -p "SSID: " WIFI_SSID; persist_var WIFI_SSID "$WIFI_SSID"
           read -s -p "Password: " WIFI_PASS; echo; persist_var WIFI_PASS "$WIFI_PASS";;
        2) SSIDS=$(sudo grep -r '^ssid=' /etc/NetworkManager/system-connections/ 2>/dev/null | cut -d= -f2)
           echo "$SSIDS" | nl -w2 -s') '
           read -p "Select SSID number: " N
           WIFI_SSID=$(echo "$SSIDS" | sed -n "${N}p"); persist_var WIFI_SSID "$WIFI_SSID"
           WIFI_PASS=$(sudo grep -r "psk=" "/etc/NetworkManager/system-connections/$WIFI_SSID.nmconnection" 2>/dev/null | cut -d= -f2)
           if [[ -z "$WIFI_PASS" ]]; then
               read -s -p "Enter Wi-Fi password: " WIFI_PASS; echo
           fi
           persist_var WIFI_PASS "$WIFI_PASS";;
    esac
}

apply_customizations() {
    local MNT=$1 BOOT=${2:-}

    # ensure DNS works inside the image
    if [[ -f /etc/resolv.conf ]]; then
        sudo mkdir -p "$MNT/etc"
        sudo rm -f "$MNT/etc/resolv.conf"        # remove symlink or old file
        sudo cp /etc/resolv.conf "$MNT/etc/resolv.conf"
    fi

    echo "$HOSTNAME" | sudo tee "$MNT/etc/hostname" >/dev/null || true
    sudo sed -i "s/127.0.1.1.*/127.0.1.1\t$HOSTNAME/" "$MNT/etc/hosts" || true

    if [[ "${SET_ROOTPW:-n}" == "y" ]]; then
        echo "root:$ROOTPW" | sudo chroot "$MNT" chpasswd
    fi

    if [[ "${CHANGE_USERNAME:-n}" == "y" && -n "${NEW_USERNAME:-}" ]]; then
        if sudo chroot "$MNT" id -u pi >/dev/null 2>&1; then
            sudo chroot "$MNT" usermod -l "$NEW_USERNAME" pi || true
            sudo chroot "$MNT" groupmod -n "$NEW_USERNAME" pi || true
            sudo chroot "$MNT" bash -c "mv /home/pi /home/$NEW_USERNAME && chown -R $NEW_USERNAME:$NEW_USERNAME /home/$NEW_USERNAME" || true
        fi
    fi

    # Wi-Fi config
    if [[ -n "${WIFI_SSID:-}" && -n "${WIFI_PASS:-}" ]]; then
        # Detect Radxa-style /boot/config support
        if [[ -d "$BOOT/config" && -f "$BOOT/config/before.txt" ]]; then
            echo "Detected Radxa image with /boot/config support."
            echo "connect_wi-fi ${WIFI_SSID} ${WIFI_PASS}" | sudo tee "$BOOT/config/before.txt" >/dev/null
            sudo touch "$BOOT/config/enable_ssh"
            echo "Configured Wi-Fi via before.txt (Radxa first-boot hook)."
        else
            echo "Standard image detected — applying classic wpa_supplicant setup."
            cat <<CONF | sudo tee "$MNT/etc/wpa_supplicant/wpa_supplicant.conf" >/dev/null
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=DE

network={
    ssid="${WIFI_SSID}"
    psk="${WIFI_PASS}"
    key_mgmt=WPA-PSK
}
CONF

            sudo chmod 600 "$MNT/etc/wpa_supplicant/wpa_supplicant.conf"
            sudo chown root:root "$MNT/etc/wpa_supplicant/wpa_supplicant.conf"

            # Enable wpa_supplicant for wlan0 if available
            if sudo chroot "$MNT" systemctl list-unit-files | grep -q 'wpa_supplicant@'; then
                sudo chroot "$MNT" systemctl enable wpa_supplicant@wlan0.service || true
            elif sudo chroot "$MNT" systemctl list-unit-files | grep -q 'wpa_supplicant.service'; then
                sudo chroot "$MNT" systemctl enable wpa_supplicant.service || true
            fi

            # Ensure DHCP config exists
            sudo mkdir -p "$MNT/etc/network/interfaces.d"
            cat <<IFACE | sudo tee "$MNT/etc/network/interfaces.d/wlan0" >/dev/null
auto wlan0
iface wlan0 inet dhcp
    wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf
IFACE
        fi
    fi


    if [[ "${ENABLE_SSH:-n}" == "y" ]]; then
        [[ -n "$BOOT" ]] && sudo touch "$BOOT/ssh" || true

        # --- auto-fix systemd unit permissions ---
        echo "Fixing world-writable systemd units in image..."
        sudo find "$MNT/lib/systemd/system" -type f -perm /002 -exec chmod 644 {} \; 2>/dev/null || true
        sudo find "$MNT/etc/systemd/system" -type f -perm /002 -exec chmod 644 {} \; 2>/dev/null || true
        # -----------------------------------------

        if sudo chroot "$MNT" systemctl list-unit-files | grep -q '^ssh\.service'; then
            sudo chroot "$MNT" systemctl enable ssh || true
        elif sudo chroot "$MNT" systemctl list-unit-files | grep -q '^sshd\.service'; then
            sudo chroot "$MNT" systemctl enable sshd || true
        fi
    fi


    if [[ "${HAVE_COMPOSE:-n}" == "y" ]]; then
        ensure_docker_in_image "$MNT"
        sudo mkdir -p "$MNT/etc/docker"
        sudo cp "$COMPOSE_FILE" "$MNT/etc/docker/docker-compose.yml"
        cat <<'UNIT' | sudo tee "$MNT/etc/systemd/system/docker-compose.service" >/dev/null
[Unit]
Description=Docker Compose Service
After=network.target docker.service
Requires=docker.service

[Service]
WorkingDirectory=/etc/docker
ExecStart=/usr/bin/docker compose up
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
        sudo chroot "$MNT" systemctl enable docker-compose || true
        sudo chroot "$MNT" bash -c "docker compose -f /etc/docker/docker-compose.yml pull" || true
    fi

    if [[ "${HAVE_SCRIPT:-n}" == "y" ]]; then
        case $SCRIPT_TYPE in
            1) sudo cp "$CUSTOM_SCRIPT" "$MNT/tmp/custom.sh"; sudo chmod +x "$MNT/tmp/custom.sh"; sudo chroot "$MNT" /bin/bash /tmp/custom.sh; sudo rm "$MNT/tmp/custom.sh";;
            2) sudo chroot "$MNT" /bin/bash -c "$INLINE_COMMAND";;
        esac
    fi
}

# -------------------------
# Main flow
# -------------------------
echo "Do you want to:"
echo "1) Flash a device now"
echo "2) Create a reproducible artifact"
read -p "Choice [1/2]: " MODE
if [[ "$MODE" == "2" ]]; then
    if [[ -f "$STATE_FILE" ]]; then
        echo "Found previous configuration in $STATE_FILE."
        read -p "Do you want to reuse it? (y/n) " REUSE
        if [[ "$REUSE" == "y" ]]; then
            source "$STATE_FILE"
            SKIP_WIZARD=y
        fi
    fi
fi

# only get BOARD if it's not already set
if [[ -z "$BOARD" ]]; then
    echo "Select board type:"
    echo "1) Raspberry Pi / Radxa (.img)"
    echo "2) NVIDIA Jetson (rootfs bundle + flash.sh)"
    read -p "Choice [1/2]: " BOARD
    persist_var BOARD "$BOARD"
fi

# -------------------------
# RPi / Radxa
# -------------------------
if [[ "$MODE" == "2" && "$BOARD" == "1" ]]; then
    if [[ "${SKIP_WIZARD:-n}" != "y" ]]; then
        collect_customizations
        read -p "Do you have a custom base .img? (y/n) " HAVE_IMG
        persist_var HAVE_IMG "$HAVE_IMG"
        if [[ "$HAVE_IMG" == "y" ]]; then
            read -p "Path or URL to base .img: " BASE_IMG
            persist_var BASE_IMG "$BASE_IMG"
            if [[ "$BASE_IMG" =~ ^https?:// ]]; then
                ensure_curl
                curl -L "$BASE_IMG" -o ./base.img
                BASE_IMG=./base.img
            fi
        else
            echo "Select base image:"
            echo "1) Raspberry Pi OS Lite (64-bit)"
            echo "2) Radxa Zero3W Ubuntu 22.04 LTS Desktop with Linux 6.1"
            echo "3) Radxa Zero3W Ubuntu 22.04 LTS Server with Linux 6.1"
            read -p "Choice [1/2/3]: " IMG_CHOICE
            persist_var IMG_CHOICE "$IMG_CHOICE"
            ensure_curl; ensure_tools
            case $IMG_CHOICE in
                1) curl -L -o rpi-os.zip https://downloads.raspberrypi.org/raspios_lite_arm64_latest; unzip -p rpi-os.zip "*.img" > base.img;;
                2) curl -L -o base.img.xz https://github.com/Joshua-Riek/ubuntu-rockchip/releases/download/v2.4.0/ubuntu-22.04-preinstalled-desktop-arm64-radxa-zero3.img.xz; unxz -f base.img.xz;;
                3) curl -L -o base.img.xz https://github.com/Joshua-Riek/ubuntu-rockchip/releases/download/v2.4.0/ubuntu-22.04-preinstalled-server-arm64-radxa-zero3.img.xz; unxz -f base.img.xz;;
            esac
            BASE_IMG=./base.img
        fi
    fi

    BASE_IMG=$(decompress_if_needed "$BASE_IMG")
    cp "$BASE_IMG" custom.img

    # --- optional resize ---
    if [[ "${SKIP_WIZARD:-n}" != "y" ]]; then
        echo "Rootfs partition often runs out of space when installing extras like Docker."
        read -p "Do you want to expand the image size? (y/n) " EXPAND_IMG
        persist_var EXPAND_IMG "$EXPAND_IMG"
        if [[ "$EXPAND_IMG" == "y" ]]; then
            read -p "Extra size to add (e.g. +2G, +4G): " EXTRA_SIZE
            persist_var EXTRA_SIZE "$EXTRA_SIZE"
        fi
    fi

    if [[ "${EXPAND_IMG:-n}" == "y" && -n "${EXTRA_SIZE:-}" ]]; then
        expand_rootfs_in_img custom.img "$EXTRA_SIZE"
    fi
    # --- end resize ---

    LOOP_DEV=$(sudo losetup -Pf --show custom.img)
    MNT=/mnt/custom

    # cleanup from previous runs
    sudo umount -R "$MNT" 2>/dev/null || true
    sudo losetup -d "$LOOP_DEV" 2>/dev/null || true
    LOOP_DEV=$(sudo losetup -Pf --show custom.img)

    # find partitions
    PARTS=$(lsblk -ln -o NAME,SIZE -b "$LOOP_DEV" | grep "^$(basename $LOOP_DEV)p")
    # root = largest partition, boot = smallest
    ROOT_PART=$(echo "$PARTS" | sort -k2 -n | tail -1 | awk '{print $1}')
    BOOT_PART=$(echo "$PARTS" | sort -k2 -n | head -1 | awk '{print $1}')

    # mount
    sudo mkdir -p "$MNT"
    sudo mount /dev/$ROOT_PART "$MNT"

    sudo mkdir -p "$MNT/boot"
    sudo mount /dev/$BOOT_PART "$MNT/boot"

    # prepare for chroot
    for d in dev sys proc dev/pts run; do
        sudo mkdir -p "$MNT/$d"
        sudo mount --bind /$d "$MNT/$d"
    done

    ensure_tools
    sudo cp /usr/bin/qemu-aarch64-static "$MNT/usr/bin/"

    apply_customizations "$MNT" "$MNT/boot"

    # cleanup
    for d in run dev/pts proc sys dev; do
        sudo umount "$MNT/$d"
    done
    sudo umount "$MNT/boot" "$MNT"
    sudo losetup -d "$LOOP_DEV"

    echo "Artifact created: custom.img"
fi

# -------------------------
# Jetson
# -------------------------
if [[ "$MODE" == "2" && "$BOARD" == "2" ]]; then
    if [[ "${SKIP_WIZARD:-n}" != "y" ]]; then
        collect_customizations
        echo "Do you already have L4T/JetPack tarballs downloaded? (y/n)"
        read -p "> " HAVE_TARBALLS
        persist_var HAVE_TARBALLS "$HAVE_TARBALLS"
    fi

    if [[ "$HAVE_TARBALLS" == "n" ]]; then
        echo "Please manually place NVIDIA JetPack tarballs in $WORKDIR/Linux_for_Tegra/"
        exit 1
    fi
    L4T_DIR=$WORKDIR/Linux_for_Tegra/rootfs
    mkdir -p "$L4T_DIR"
    if [[ ! -d "$L4T_DIR/etc" ]]; then
        echo "Extract the rootfs into Linux_for_Tegra/rootfs before running."
        exit 1
    fi
    (cd $WORKDIR/Linux_for_Tegra && sudo ./apply_binaries.sh)
    sudo cp /usr/bin/qemu-aarch64-static $L4T_DIR/usr/bin/ || true
    for d in dev sys proc; do sudo mount --bind /$d $L4T_DIR/$d; done
    apply_customizations $L4T_DIR
    for d in dev sys proc; do sudo umount $L4T_DIR/$d; done
    tar czf custom-jetson-rootfs.tar.gz -C $WORKDIR/Linux_for_Tegra rootfs
    echo "Artifact created: custom-jetson-rootfs.tar.gz"
    echo "To flash: put Jetson in recovery mode and run flash.sh from Linux_for_Tegra."
fi

# -------------------------
# Mode: Flash
# -------------------------
if [[ "$MODE" == "1" ]]; then
    if [[ "$BOARD" == "1" ]]; then
        read -p "Path to .img to flash: " IMG
        if [[ ! -f "$IMG" ]]; then
            echo "Image not found: $IMG"
            exit 1
        fi
        list_safe_devices
        read -p "Enter target device (e.g. /dev/sdX): " TARGET_DEV
        if [[ ! -b "$TARGET_DEV" ]]; then
            echo "Target device $TARGET_DEV is not valid."
            exit 1
        fi
        read -p "Are you SURE you want to erase $TARGET_DEV? (y/n) " CONFIRM
        [[ "$CONFIRM" != "y" ]] && exit 1
        echo "Flashing $IMG to $TARGET_DEV ..."
        sudo dd if="$IMG" of="$TARGET_DEV" bs=4M status=progress conv=fsync
        sync
        echo "Flash complete."

    elif [[ "$BOARD" == "2" ]]; then
        read -p "Path to Linux_for_Tegra directory: " L4T_DIR
        if [[ ! -d "$L4T_DIR" ]]; then
            echo "Linux_for_Tegra directory not found."
            exit 1
        fi
        cd "$L4T_DIR"
        if [[ ! -x ./flash.sh ]]; then
            echo "flash.sh not found in $L4T_DIR"
            exit 1
        fi
        read -p "Do you have a prepared rootfs bundle (custom-jetson-rootfs.tar.gz)? (y/n) " HAVE_BUNDLE
        if [[ "$HAVE_BUNDLE" == "y" ]]; then
            read -p "Path to rootfs bundle: " BUNDLE
            if [[ ! -f "$BUNDLE" ]]; then
                echo "Bundle not found: $BUNDLE"
                exit 1
            fi
            sudo tar -xzf "$BUNDLE" -C rootfs/
        fi
        echo "Select Jetson target config:"
        echo "1) jetson-nano-emmc"
        echo "2) jetson-xavier-nx"
        echo "3) jetson-agx-orin-devkit"
        echo "4) Custom config name"
        read -p "Choice: " JCONF
        case $JCONF in
            1) CONFIG="jetson-nano-emmc" ;;
            2) CONFIG="jetson-xavier-nx" ;;
            3) CONFIG="jetson-agx-orin-devkit" ;;
            4) read -p "Enter custom config string: " CONFIG ;;
            *) echo "Invalid"; exit 1 ;;
        esac
        echo "Put Jetson into recovery mode and connect USB."
        read -p "Press Enter when ready..."
        sudo ./flash.sh $CONFIG mmcblk0p1
        echo "Jetson flash complete."
    fi
fi

echo "=== Done! ==="
