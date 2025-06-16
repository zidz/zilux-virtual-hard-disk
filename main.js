// main.js - Main Electron Process

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

// Keep a reference to the rclone mount process
let rcloneProcess = null;
// Flag to differentiate a crash from an intentional unmount
let unmountInitiatedByUser = false;

// Define the path for the configuration file
const configPath = path.join(app.getPath('userData'), 'rclone-s3-mounter-profiles.json');

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 860,
        height: 600,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: "Rclone S3 Mounter",
        icon: path.join(__dirname, 'assets/icon.png') // Optional: Add an icon
    });

    // and load the index.html of the app.
    mainWindow.loadFile('index.html');
    
    // Hide the default application menu
    mainWindow.setMenu(null);

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
        mainWindow = null;
        if (rcloneProcess) {
            unmountInitiatedByUser = true;
            rcloneProcess.kill();
            rcloneProcess = null;
        }
    });
}

// --- App Lifecycle Events ---

app.on('ready', createWindow);

app.on('window-all-closed', function() {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function() {
    if (mainWindow === null) {
        createWindow();
    }
});

// --- Utility Functions ---
function sendStatus(message, type = 'info') {
    if (mainWindow) {
        mainWindow.webContents.send('status-update', { message, type });
    }
}

// --- IPC Handlers ---

ipcMain.handle('list-buckets', async (event, profile) => {
    const { endpoint, accessKey, secretKey, configPassword } = profile;
    const tempRemoteName = 'tempbucketlist';

    // Use environment variables for a non-interactive, temporary remote configuration
    const rcloneEnv = {
        ...process.env,
        RCLONE_CONFIG_PASS: configPassword || '',
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_TYPE`]: 's3',
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_PROVIDER`]: 'Ceph',
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_ENV_AUTH`]: 'false',
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_ENDPOINT`]: endpoint,
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_ACCESS_KEY_ID`]: accessKey,
        [`RCLONE_CONFIG_${tempRemoteName.toUpperCase()}_SECRET_ACCESS_KEY`]: secretKey,
    };
    
    const listArgs = ['lsf', `${tempRemoteName}:`, '--dirs-only'];
    
    return new Promise((resolve) => {
        const listProcess = spawn('rclone', listArgs, { env: rcloneEnv });

        let stdoutOutput = '';
        let stderrOutput = '';
        listProcess.stdout.on('data', (data) => { stdoutOutput += data.toString(); });
        listProcess.stderr.on('data', (data) => { stderrOutput += data.toString(); });

        listProcess.on('close', (closeCode) => {
            if (closeCode !== 0) {
                const errorMsg = stderrOutput || `rclone exited with code ${closeCode}`;
                sendStatus(`Failed to list buckets: ${errorMsg}`, 'error');
                resolve({ success: false, error: errorMsg });
            } else {
                const buckets = stdoutOutput.trim().split('\n').map(b => b.replace(/\/$/, '')).filter(Boolean);
                resolve({ success: true, buckets });
            }
        });

        listProcess.on('error', (err) => {
            sendStatus(`Failed to start rclone for listing buckets: ${err.message}`, 'error');
            resolve({ success: false, error: err.message });
        });
    });
});

ipcMain.handle('check-rclone', async () => {
    return new Promise((resolve) => {
        const check = spawn('rclone', ['--version']);
        check.on('error', () => resolve(false));
        check.on('close', (code) => resolve(code === 0));
    });
});

ipcMain.handle('browse-mount-point', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select a Mount Point'
    });
    return (canceled || filePaths.length === 0) ? null : filePaths[0];
});

ipcMain.handle('load-profiles', async () => {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        sendStatus(`Error loading profiles: ${error.message}`, 'error');
        return {};
    }
});

ipcMain.handle('save-profiles', async (event, profiles) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(profiles, null, 2));
    } catch (error) {
        sendStatus(`Error saving profiles: ${error.message}`, 'error');
    }
});

ipcMain.handle('unmount', async () => {
    if (!rcloneProcess) {
        sendStatus('No active mount to unmount.', 'warn');
        return { success: false, message: 'Not mounted' };
    }
    
    sendStatus('Unmounting filesystem...', 'info');
    return new Promise((resolve) => {
        unmountInitiatedByUser = true;
        rcloneProcess.kill('SIGINT');
        const timeout = setTimeout(() => {
            if (rcloneProcess) {
                rcloneProcess.kill('SIGKILL');
            }
        }, 3000);
        rcloneProcess.on('close', () => {
            clearTimeout(timeout);
            rcloneProcess = null;
            resolve({ success: true });
        });
    });
});

ipcMain.handle('mount', async (event, profile) => {
    if (rcloneProcess) {
        sendStatus('A mount is already active. Please unmount first.', 'error');
        return;
    }

    unmountInitiatedByUser = false;
    const { profileName, endpoint, accessKey, secretKey, bucketName, mountPoint, configPassword } = profile;

    sendStatus(`Creating rclone config for profile: ${profileName}...`, 'info');
    const configArgs = ['config', 'create', profileName, 's3', 'provider', 'Ceph', 'env_auth', 'false', 'endpoint', endpoint, 'access_key_id', accessKey, 'secret_access_key', secretKey];
    const rcloneEnv = { ...process.env, RCLONE_CONFIG_PASS: configPassword || '' };

    const configProcess = spawn('rclone', configArgs, { env: rcloneEnv });
    configProcess.on('close', (code) => {
        if (code !== 0) {
            sendStatus(`rclone config creation failed.`, 'error');
            return;
        }
        sendStatus('rclone configuration created successfully.', 'success');
        
        try {
            if (!fs.existsSync(mountPoint)) {
                fs.mkdirSync(mountPoint, { recursive: true });
                sendStatus(`Created mount point directory.`, 'success');
            }
        } catch (error) {
            sendStatus(`Failed to create mount point: ${error.message}`, 'error');
            return;
        }

        const remotePath = `${profileName}:${bucketName}`;
        sendStatus(`Attempting to mount '${remotePath}'...`, 'info');
        const mountArgs = ['mount', remotePath, mountPoint, '--vfs-cache-mode', 'full', '--log-level', 'DEBUG', '--log-file', path.join(app.getPath('temp'), 'rclone-mount.log')];
        
        let stdoutOutput = '';
        let stderrOutput = '';
        rcloneProcess = spawn('rclone', mountArgs, { env: rcloneEnv });

        rcloneProcess.stdout.on('data', (data) => { stdoutOutput += data.toString(); });
        rcloneProcess.stderr.on('data', (data) => { stderrOutput += data.toString(); });
        
        rcloneProcess.on('error', (err) => {
            sendStatus(`Failed to start rclone: ${err.message}`, 'error');
            rcloneProcess = null;
            mainWindow.webContents.send('mount-terminated');
        });
        
        rcloneProcess.on('close', (closeCode) => {
            if (unmountInitiatedByUser) {
                sendStatus('Mount terminated by user.', 'success');
            } else {
                const combinedOutput = (stdoutOutput + stderrOutput).trim();
                sendStatus(`Mount process failed with exit code ${closeCode}. Output:\n${combinedOutput || 'No output captured.'}`, 'error');
            }
            rcloneProcess = null;
            mainWindow.webContents.send('mount-terminated');
        });

        setTimeout(() => {
            if (rcloneProcess && !rcloneProcess.killed) {
                sendStatus(`Successfully mounted '${remotePath}'.`, 'success');
                mainWindow.webContents.send('mount-successful');
            }
        }, 2500);
    });
});
