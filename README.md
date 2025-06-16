# Zilux Virtual Hard Disk

En S3-klient för att montera Zilux Storage lagringsutrymme som en virtuell hårddisk. (An S3 client to mount Zilux Storage space as a virtual hard disk.)

## Prerequisites

*   Node.js and npm
*   rclone (for Linux, if building/installing the .deb package)

## Preparing Linux for Makefile Usage

To use the `Makefile` on a Linux system for building the Debian package, you'll need to ensure the following tools are installed:

*   **make:** The build automation tool itself.
    ```bash
    sudo apt update
    sudo apt install make
    ```

*   **dpkg-dev:** Contains `dpkg-deb`, used for building Debian packages.
    ```bash
    sudo apt update
    sudo apt install dpkg-dev
    ```

Node.js (which includes npm) is also a prerequisite for Makefile usage. Refer to the "Prerequisites" section above for installation. Other common utilities like `rm`, `mkdir`, `cp`, and `chmod` are generally pre-installed on most Linux distributions.

## Zilux IT AB Storage Service

This application is designed to work with S3 buckets created through the [Zilux IT AB Storage Service](https://www.zilux.se/storage). You will need an account and a pre-configured S3 bucket from this service to mount it as a virtual hard disk using this tool.

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd zilux-virtual-hard-disk
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Building from source:

*   **For Development:**
    ```bash
    npm start
    ```
    This will start the application in development mode.

*   **Linux (.deb package):**
    1.  Package the application:
        ```bash
        npm run package-linux
        ```
        Alternatively, you can use the Makefile:
        ```bash
        make package-linux
        ```
    2.  Build the .deb package:
        ```bash
        make deb
        ```
        The output will be in the `build/` directory. This package depends on `rclone`.

*   **Windows (.exe installer):**
    ```bash
    npm run dist:win
    ```
    Alternatively, you can use the Makefile:
    ```bash
    make win
    ```
    The output will be in the `dist/` directory.

## Usage for End Users

This section describes how to install the application if you have obtained a pre-built package.

### Linux (Debian/Ubuntu)

If you have a `.deb` package (e.g., `zilux-virtual-hard-disk_0.1.0_amd64.deb`):

1.  Open a terminal.
2.  Navigate to the directory where you downloaded the `.deb` file.
3.  Install the package using `dpkg`:
    ```bash
    sudo dpkg -i zilux-virtual-hard-disk_*.deb
    ```
    Replace `zilux-virtual-hard-disk_*.deb` with the actual filename.
4.  If there are any dependency issues (like a missing `rclone` package, which this application depends on), resolve them by running:
    ```bash
    sudo apt-get install -f
    ```
    This command will attempt to download and install any missing dependencies.
5.  Once installed, you should find "Zilux Virtual Hard Disk" in your application menu.

### Windows

If you have an `.exe` installer (e.g., `Zilux Virtual Hard Disk Setup 0.1.0.exe`):

1.  Download the `.exe` file.
2.  Double-click the downloaded file to run the installer.
3.  Follow the on-screen instructions. You may be prompted to allow the application to make changes to your device.
4.  Once installed, you should find "Zilux Virtual Hard Disk" in your Start Menu and potentially a shortcut on your Desktop.

## Usage (Development)

After installation (or when running in development mode with `npm start`), the application will guide you through configuring your S3 storage.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## Author

*   **Christoffer Lilja (Zilux IT AB)**

## License

This project is licensed under the CC-BY-NC-ND-4.0 License.
