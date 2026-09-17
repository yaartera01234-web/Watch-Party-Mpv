#!/bin/bash
set -e

SRC="src/assets/images/watchparty_app_icon_1789632846023.jpg"

echo "Generating icons from $SRC..."

# Web / PWA icons
convert "$SRC" -resize 512x512 public/apple-touch-icon.png
convert "$SRC" -resize 512x512 public/icon.png
convert "$SRC" -resize 192x192 public/pwa-192x192.png
convert "$SRC" -resize 512x512 public/pwa-512x512.png
convert "$SRC" -resize 64x64 public/favicon.ico

# Android mipmap icons
# mdpi
convert "$SRC" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
convert "$SRC" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
convert "$SRC" -resize 108x108 android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png

# hdpi
convert "$SRC" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
convert "$SRC" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
convert "$SRC" -resize 162x162 android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png

# xhdpi
convert "$SRC" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
convert "$SRC" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
convert "$SRC" -resize 216x216 android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png

# xxhdpi
convert "$SRC" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
convert "$SRC" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
convert "$SRC" -resize 324x324 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png

# xxxhdpi
convert "$SRC" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
convert "$SRC" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
convert "$SRC" -resize 432x432 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png

echo "All icons generated successfully!"
