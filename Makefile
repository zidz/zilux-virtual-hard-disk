# Makefile for building the Zilux Virtual Hard Disk packages

# --- Configuration ---
# App details from package.json
APP_NAME := $(shell node -p "require('./package.json').name")
APP_VERSION := $(shell node -p "require('./package.json').version")
APP_ARCH := amd64

# Build directories
BUILD_DIR := build
# Linux-specific
DEB_PACKAGE_DIR := $(BUILD_DIR)/$(APP_NAME)-$(APP_VERSION)-$(APP_ARCH)
ELECTRON_LINUX_BUILD_DIR := release-build/$(APP_NAME)-linux-x64
# Windows-specific installer directory
WIN_INSTALLER_DIR := dist

# Default target
all: deb win

# --- Main Targets ---

# Build Windows Installer
win: node_modules
	@echo "📦 Building Windows installer..."
	@npm run dist:win
	@echo "\n✅ Windows installer created successfully in:"
	@echo "   $(WIN_INSTALLER_DIR)"


# Full Debian package creation
deb: package-linux
	@echo "🛠️  Building Debian package structure..."
	# 1. Clean and create directory structure
	rm -rf $(DEB_PACKAGE_DIR)
	mkdir -p $(DEB_PACKAGE_DIR)/DEBIAN
	mkdir -p $(DEB_PACKAGE_DIR)/usr/lib/$(APP_NAME)
	mkdir -p $(DEB_PACKAGE_DIR)/usr/share/applications
	mkdir -p $(DEB_PACKAGE_DIR)/usr/share/icons/hicolor/256x256/apps
	mkdir -p $(DEB_PACKAGE_DIR)/usr/bin

	# 2. Copy packaged Electron app files
	@echo "-> Copying application files..."
	cp -r $(ELECTRON_LINUX_BUILD_DIR)/* $(DEB_PACKAGE_DIR)/usr/lib/$(APP_NAME)/

	# 3. Create the DEBIAN/control file
	@echo "    -> Creating DEBIAN/control file..."
	@echo "Package: $(APP_NAME)" > $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Version: $(APP_VERSION)" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Section: utils" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Priority: optional" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Architecture: $(APP_ARCH)" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Depends: rclone" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Maintainer: Christoffer Lilja (Zilux IT AB) <your-email@example.com>" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo "Description: En S3-klient för att montera lagringsutrymme." >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo " Zilux Virtual Hard Disk är en applikation som använder rclone för att" >> $(DEB_PACKAGE_DIR)/DEBIAN/control
	@echo " montera S3-kompatibel lagring som en lokal enhet." >> $(DEB_PACKAGE_DIR)/DEBIAN/control

	# 4. Create the .desktop file for the application menu
	@echo "    -> Creating .desktop file for application menu..."
	@echo "[Desktop Entry]" > $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Name=Zilux Virtual Hard Disk" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Comment=Montera S3-lagring som en lokal enhet" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Exec=/usr/bin/$(APP_NAME)" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Icon=$(APP_NAME)" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Terminal=false" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Type=Application" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	@echo "Categories=Utility;System;" >> $(DEB_PACKAGE_DIR)/usr/share/applications/$(APP_NAME).desktop
	
	# 5. Copy the application icon
	@echo "    -> Copying application icon..."
	cp assets/icon.png $(DEB_PACKAGE_DIR)/usr/share/icons/hicolor/256x256/apps/$(APP_NAME).png

	# 6. Create an executable launcher script in /usr/bin
	@echo "    -> Creating executable launcher..."
	@echo "#!/bin/sh" > $(DEB_PACKAGE_DIR)/usr/bin/$(APP_NAME)
	@echo "exec /usr/lib/$(APP_NAME)/$(APP_NAME) \"\$$@\"" >> $(DEB_PACKAGE_DIR)/usr/bin/$(APP_NAME)
	chmod 755 $(DEB_PACKAGE_DIR)/usr/bin/$(APP_NAME)
	
	# 7. Build the final .deb package
	@echo "    -> Building .deb file..."
	dpkg-deb --build $(DEB_PACKAGE_DIR) $(BUILD_DIR)/
	@echo "\n✅ Debian package created successfully:"
	@echo "   $(BUILD_DIR)/$(APP_NAME)_$(APP_VERSION)_$(APP_ARCH).deb"

# --- Packaging Targets ---

# Run electron-packager to bundle the Linux app
package-linux: node_modules
	@echo "📦 Packaging Electron application for Linux..."
	@npm run package-linux

# --- Utility Targets ---

# Check for node_modules
node_modules: package.json
	@echo "⚙️  Installing dependencies..."
	@npm install
	@touch node_modules

# Clean up build artifacts
clean:
	@echo "🧹 Cleaning up build artifacts..."
	rm -rf $(BUILD_DIR) release-build dist

.PHONY: all deb win package-linux clean