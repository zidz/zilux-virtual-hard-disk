// main.js - Main Electron Process

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

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
        width: 520, // Adjusted width to better fit the `max-w-md` content
        height: 990, // Adjusted height to fit all content without scrolling
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: "Zilux - Virtuell Hårddisk", // Translated
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

/**
 * NEW FUNCTION: Imports profiles from the user's rclone.conf file.
 * If the config is not encrypted, it reads all details.
 * If the config is encrypted, it only reads the remote names as stubs.
 */
async function importProfilesFromRclone() {
    const importedProfiles = {};

    // First, try to get full config details with `rclone config dump`
    const dumpPromise = new Promise(resolve => {
        const dumpProcess = spawn('rclone', ['config', 'dump']);
        let stdout = '';
        dumpProcess.stdout.on('data', data => stdout += data.toString());
        dumpProcess.on('close', code => {
            if (code === 0) {
                try {
                    const rcloneConfig = JSON.parse(stdout);
                    for (const remoteName in rcloneConfig) {
                        const remote = rcloneConfig[remoteName];
                        // We only care about S3 providers for this app
                        if (remote && remote.type === 's3') {
                             importedProfiles[remoteName] = {
                                profileName: remoteName,
                                endpoint: remote.endpoint || '',
                                accessKey: remote.access_key_id || '',
                                secretKey: remote.secret_access_key || '',
                                bucketName: '', // Bucket is not stored in rclone config
                                mountPoint: '', // Mount point is not stored in rclone config
                            };
                        }
                    }
                } catch (e) {
                    // JSON parsing failed, proceed to next step
                }
            }
            resolve(code);
        });
        dumpProcess.on('error', () => resolve(1));
    });

    const exitCode = await dumpPromise;

    // If `config dump` failed (e.g., encrypted config), get names with `listremotes`
    if (exitCode !== 0) {
        const listPromise = new Promise(resolve => {
            const listProcess = spawn('rclone', ['listremotes']);
            let stdout = '';
            listProcess.stdout.on('data', data => stdout += data.toString());
            listProcess.on('close', () => {
                const remoteNames = stdout.trim().split('\n').map(name => name.replace(':', ''));
                for (const name of remoteNames) {
                    if (name && !importedProfiles[name]) { // Don't overwrite if already found
                        importedProfiles[name] = { profileName: name }; // Create a stub profile
                    }
                }
                resolve();
            });
            listProcess.on('error', () => resolve());
        });
        await listPromise;
    }

    return importedProfiles;
}


// --- IPC Handlers ---

ipcMain.handle('is-config-encrypted', async () => {
    return new Promise((resolve) => {
        // Find the rclone config file path
        const OBFUSCATED_STRING = "# Encrypted rclone configuration File";
        const configProcess = spawn('rclone', ['config', 'file']);
        let configPathStr = '';
        configProcess.stdout.on('data', (data) => { configPathStr += data.toString(); });
        configProcess.on('close', (code) => {
            if (code !== 0) return resolve(false); // Can't find config, assume not encrypted
            
            const rcloneConfigPath = configPathStr.trim();
            if (!fs.existsSync(rcloneConfigPath)) return resolve(false);

            try {
                const readStream = fs.createReadStream(rcloneConfigPath, 'utf8');
                const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });
                
                rl.once('line', (firstLine) => {
                    resolve(firstLine.trim() === OBFUSCATED_STRING);
                    rl.close();
                    readStream.destroy();
                });

                rl.once('error', () => resolve(false));

            } catch {
                resolve(false);
            }
        });
        configProcess.on('error', () => resolve(false));
    });
});

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
                const errorMsg = stderrOutput || `rclone avslutades med kod ${closeCode}`;
                sendStatus(`Kunde inte lista buckets: ${errorMsg}`, 'error');
                resolve({ success: false, error: errorMsg });
            } else {
                const buckets = stdoutOutput.trim().split('\n').map(b => b.replace(/\/$/, '')).filter(Boolean);
                resolve({ success: true, buckets });
            }
        });

        listProcess.on('error', (err) => {
            sendStatus(`Kunde inte starta rclone för att lista buckets: ${err.message}`, 'error');
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
        title: 'Välj en monteringspunkt' // Translated
    });
    return (canceled || filePaths.length === 0) ? null : filePaths[0];
});

/**
 * MODIFIED: This function now loads profiles from both the app's config
 * and the user's rclone.conf, merging them together.
 */
ipcMain.handle('load-profiles', async () => {
    let appProfiles = {};
    // 1. Load profiles saved by this application
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            appProfiles = JSON.parse(data);
        }
    } catch (error) {
        sendStatus(`Fel vid inläsning av app-profiler: ${error.message}`, 'error');
    }

    // 2. Import profiles from the user's main rclone.conf
    const rcloneProfiles = await importProfilesFromRclone();
    
    // 3. Merge profiles. The app's saved profiles take precedence.
    const mergedProfiles = { ...rcloneProfiles, ...appProfiles };

    return mergedProfiles;
});

ipcMain.handle('save-profiles', async (event, profiles) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(profiles, null, 2));
    } catch (error) {
        sendStatus(`Fel vid sparning av profiler: ${error.message}`, 'error');
    }
});

ipcMain.handle('unmount', async () => {
    if (!rcloneProcess) {
        sendStatus('Ingen aktiv montering att avmontera.', 'warn');
        return { success: false, message: 'Not mounted' };
    }
    
    sendStatus('Avmonterar filsystem...', 'info');
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
        sendStatus('En montering är redan aktiv. Vänligen avmontera först.', 'error');
        return;
    }

    unmountInitiatedByUser = false;
    const { profileName, endpoint, accessKey, secretKey, bucketName, mountPoint, configPassword } = profile;

    sendStatus(`Skapar rclone-konfiguration för profilen: ${profileName}...`, 'info');
    const configArgs = ['config', 'create', profileName, 's3', 'provider', 'Ceph', 'env_auth', 'false', 'endpoint', endpoint, 'access_key_id', accessKey, 'secret_access_key', secretKey];
    const rcloneEnv = { ...process.env, RCLONE_CONFIG_PASS: configPassword || '' };

    const configProcess = spawn('rclone', configArgs, { env: rcloneEnv });
    configProcess.on('close', (code) => {
        if (code !== 0) {
            sendStatus('Skapandet av rclone-konfigurationen misslyckades.', 'error');
            return;
        }
        sendStatus('rclone-konfigurationen har skapats.', 'success');
        
        try {
            if (!fs.existsSync(mountPoint)) {
                fs.mkdirSync(mountPoint, { recursive: true });
                sendStatus('Skapade katalog för monteringspunkt.', 'success');
            }
        } catch (error) {
            sendStatus(`Kunde inte skapa monteringspunkt: ${error.message}`, 'error');
            return;
        }

        const remotePath = `${profileName}:${bucketName}`;
        sendStatus(`Försöker montera '${remotePath}'...`, 'info');
        const mountArgs = ['mount', remotePath, mountPoint, '--vfs-cache-mode', 'full', '--log-level', 'DEBUG', '--log-file', path.join(app.getPath('temp'), 'rclone-mount.log')];
        
        let stdoutOutput = '';
        let stderrOutput = '';
        rcloneProcess = spawn('rclone', mountArgs, { env: rcloneEnv });

        rcloneProcess.stdout.on('data', (data) => { stdoutOutput += data.toString(); });
        rcloneProcess.stderr.on('data', (data) => { stderrOutput += data.toString(); });
        
        rcloneProcess.on('error', (err) => {
            sendStatus(`Kunde inte starta rclone: ${err.message}`, 'error');
            rcloneProcess = null;
            mainWindow.webContents.send('mount-terminated');
        });
        
        rcloneProcess.on('close', (closeCode) => {
            if (unmountInitiatedByUser) {
                sendStatus('Monteringen avslutades av användaren.', 'success');
            } else {
                const combinedOutput = (stdoutOutput + stderrOutput).trim();
                sendStatus(`Monteringsprocessen misslyckades med felkod ${closeCode}. Output:\n${combinedOutput || 'Ingen output fångades.'}`, 'error');
            }
            rcloneProcess = null;
            mainWindow.webContents.send('mount-terminated');
        });

        setTimeout(() => {
            if (rcloneProcess && !rcloneProcess.killed) {
                sendStatus(`Lyckades montera '${remotePath}'.`, 'success');
                mainWindow.webContents.send('mount-successful');
            }
        }, 2500);
    });
});