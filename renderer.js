// renderer.js - Renderer Process Logic

window.addEventListener('DOMContentLoaded', () => {
    // --- Get references to all UI elements ---
    const ui = {
        rcloneStatus: document.getElementById('rclone-status-indicator'),
        profileSelect: document.getElementById('profile-select'),
        btnDeleteProfile: document.getElementById('btn-delete-profile'),
        btnSaveProfile: document.getElementById('btn-save-profile'),
        btnMount: document.getElementById('btn-mount'),
        btnUnmount: document.getElementById('btn-unmount'),
        btnBrowse: document.getElementById('btn-browse'),
        logPanel: document.getElementById('log-panel'),
        
        // Form inputs and new elements
        profileNameInput: document.getElementById('profile-name'),
        endpointUrlInput: document.getElementById('endpoint-url'),
        accessKeyInput: document.getElementById('access-key'),
        secretKeyInput: document.getElementById('secret-key'),
        configPasswordInput: document.getElementById('config-password'),
        mountPointInput: document.getElementById('mount-point'),
        bucketSelect: document.getElementById('bucket-name'),
        btnRefreshBuckets: document.getElementById('btn-refresh-buckets'),

        // Password modal
        passwordModal: document.getElementById('password-modal'),
        passwordModalCloseBtn: document.getElementById('password-modal-close-btn'),
    };
    
    // An array of all inputs for easy processing
    const allFormInputs = [ui.profileNameInput, ui.endpointUrlInput, ui.accessKeyInput, ui.secretKeyInput, ui.configPasswordInput, ui.mountPointInput];

    // --- Application State ---
    let profiles = {};
    let isMounted = false;
    let rcloneAvailable = false;

    // --- UI Update Functions ---
    function updateStatusPill() {
        if (isMounted) {
            ui.rcloneStatus.textContent = 'Monterad';
            ui.rcloneStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-green-600/50 text-green-300 border border-green-500/50';
        } else {
            if (rcloneAvailable) {
                ui.rcloneStatus.textContent = 'Inte monterad';
                ui.rcloneStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-yellow-500/30 text-yellow-300 border border-yellow-500/50';
            } else {
                ui.rcloneStatus.textContent = 'rclone saknas';
                ui.rcloneStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-red-500/30 text-red-300 border border-red-500/50';
            }
        }
    }

    function updateButtonStates() {
        updateStatusPill();
        const isProfileSelected = !!ui.profileSelect.value;
        const canListBuckets = ui.endpointUrlInput.value && ui.accessKeyInput.value && ui.secretKeyInput.value;

        ui.btnDeleteProfile.disabled = isMounted || !isProfileSelected;
        ui.btnSaveProfile.disabled = isMounted;
        ui.btnRefreshBuckets.disabled = isMounted || !canListBuckets;
        
        if (isMounted) {
            ui.btnMount.disabled = true;
            ui.btnUnmount.disabled = false;
            allFormInputs.forEach(input => input.disabled = true);
            ui.bucketSelect.disabled = true;
            ui.btnBrowse.disabled = true;
        } else {
            ui.btnMount.disabled = !rcloneAvailable;
            ui.btnUnmount.disabled = true;
            allFormInputs.forEach(input => input.disabled = false);
            ui.bucketSelect.disabled = false;
            ui.btnBrowse.disabled = false;
        }
    }

    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.innerHTML = `<span class="text-gray-400/50 mr-2">${timestamp}</span><span class="log-${type}">${message}</span>`;
        ui.logPanel.appendChild(logEntry);
        ui.logPanel.scrollTop = ui.logPanel.scrollHeight;
    }

    function populateProfileSelect() {
        const selectedValue = ui.profileSelect.value;
        ui.profileSelect.innerHTML = '<option value="">-- Ny profil --</option>';
        for (const name in profiles) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            ui.profileSelect.appendChild(option);
        }
        ui.profileSelect.value = selectedValue || "";
    }
    
    function loadProfileIntoForm() {
        const selectedProfileName = ui.profileSelect.value;
        const profile = profiles[selectedProfileName];
        if (profile) {
            ui.profileNameInput.value = profile.profileName || '';
            ui.endpointUrlInput.value = profile.endpoint || '';
            ui.accessKeyInput.value = profile.accessKey || '';
            ui.secretKeyInput.value = profile.secretKey || '';
            ui.mountPointInput.value = profile.mountPoint || '';
            ui.configPasswordInput.value = ''; // Clear password field

            ui.bucketSelect.innerHTML = '';
            if (profile.bucketName) {
                const option = document.createElement('option');
                option.value = profile.bucketName;
                option.textContent = profile.bucketName;
                option.selected = true;
                ui.bucketSelect.appendChild(option);
            } else {
                 ui.bucketSelect.innerHTML = '<option value="">-- Välj en bucket --</option>';
            }
        } else {
            allFormInputs.forEach(input => input.value = '');
            ui.bucketSelect.innerHTML = '<option value="">-- Ange inloggningsuppgifter för att lista buckets --</option>';
        }
        updateButtonStates();
    }

    // --- Action Handlers ---

    function handleSaveProfile() {
        const profileName = ui.profileNameInput.value.trim();
        if (!profileName) return log('Profilnamn får inte vara tomt.', 'error');
        
        profiles[profileName] = {
            profileName,
            endpoint: ui.endpointUrlInput.value.trim(),
            accessKey: ui.accessKeyInput.value.trim(),
            secretKey: ui.secretKeyInput.value,
            bucketName: ui.bucketSelect.value,
            mountPoint: ui.mountPointInput.value.trim(),
        };

        window.electronAPI.saveProfiles(profiles);
        populateProfileSelect();
        ui.profileSelect.value = profileName;
        log(`Profilen "${profileName}" har sparats.`, 'success');
        updateButtonStates();
    }

    function handleMount() {
        const profileData = {
            profileName: ui.profileNameInput.value.trim(),
            endpoint: ui.endpointUrlInput.value.trim(),
            accessKey: ui.accessKeyInput.value.trim(),
            secretKey: ui.secretKeyInput.value,
            bucketName: ui.bucketSelect.value,
            mountPoint: ui.mountPointInput.value.trim(),
            configPassword: ui.configPasswordInput.value
        };

        if (!profileData.profileName || !profileData.endpoint || !profileData.accessKey || !profileData.secretKey || !profileData.bucketName || !profileData.mountPoint) {
            return log('Vänligen fyll i alla konfigurationsfält innan montering.', 'error');
        }
        window.electronAPI.mount(profileData);
    }
    
    async function handleRefreshBuckets() {
        const profileForListing = {
            endpoint: ui.endpointUrlInput.value.trim(),
            accessKey: ui.accessKeyInput.value.trim(),
            secretKey: ui.secretKeyInput.value,
            configPassword: ui.configPasswordInput.value,
        };

        if (!profileForListing.endpoint || !profileForListing.accessKey || !profileForListing.secretKey) {
            return log('Endpoint, Access Key och Secret Key krävs för att lista buckets.', 'warn');
        }
        
        log('Hämtar bucket-lista...', 'info');
        ui.btnRefreshBuckets.disabled = true;

        const result = await window.electronAPI.listBuckets(profileForListing);
        
        const currentBucket = ui.bucketSelect.value;
        ui.bucketSelect.innerHTML = ''; // Clear existing options

        if (result && result.success) {
            if (result.buckets.length === 0) {
                ui.bucketSelect.innerHTML = '<option value="">-- Inga buckets hittades --</option>';
            } else {
                result.buckets.forEach(bucket => {
                    const option = document.createElement('option');
                    option.value = bucket;
                    option.textContent = bucket;
                    ui.bucketSelect.appendChild(option);
                });
                log(`Hämtade ${result.buckets.length} buckets.`, 'success');
            }
            if (result.buckets.includes(currentBucket)) {
                ui.bucketSelect.value = currentBucket;
            }
        } else {
            log('Kunde inte hämta buckets. Kontrollera inloggningsuppgifter och konfigurationslösenord.', 'error');
            ui.bucketSelect.innerHTML = '<option value="">-- Fel vid hämtning av buckets --</option>';
        }
        updateButtonStates();
    }
    
    async function checkEncryptionAndProceed(actionCallback) {
        if (ui.configPasswordInput.value) {
            actionCallback();
            return;
        }

        const isEncrypted = await window.electronAPI.isConfigEncrypted();
        if (isEncrypted) {
            ui.passwordModal.classList.remove('hidden');
        } else {
            actionCallback();
        }
    }

    // --- Event Listeners ---
    
    ui.btnRefreshBuckets.addEventListener('click', () => checkEncryptionAndProceed(handleRefreshBuckets));
    ui.btnMount.addEventListener('click', () => checkEncryptionAndProceed(handleMount));
    ui.btnSaveProfile.addEventListener('click', handleSaveProfile);

    ui.passwordModalCloseBtn.addEventListener('click', () => ui.passwordModal.classList.add('hidden'));
    
    [ui.endpointUrlInput, ui.accessKeyInput, ui.secretKeyInput].forEach(input => input.addEventListener('input', updateButtonStates));
    ui.profileSelect.addEventListener('change', loadProfileIntoForm);
    
    ui.btnBrowse.addEventListener('click', async () => {
        const path = await window.electronAPI.browseMountPoint();
        if (path) ui.mountPointInput.value = path;
    });

    ui.btnDeleteProfile.addEventListener('click', async () => {
        const selectedProfileName = ui.profileSelect.value;
        if (selectedProfileName && confirm(`Ta bort profilen "${selectedProfileName}"?`)) {
            delete profiles[selectedProfileName];
            await window.electronAPI.saveProfiles(profiles);
            ui.profileSelect.value = "";
            loadProfileIntoForm();
            populateProfileSelect();
            log(`Profilen "${selectedProfileName}" har tagits bort.`, 'info');
        }
    });

    ui.btnUnmount.addEventListener('click', () => window.electronAPI.unmount());

    // --- IPC Event Handlers from Main Process ---
    window.electronAPI.onStatusUpdate(({ message, type }) => log(message, type));
    window.electronAPI.onMountSuccessful(() => { isMounted = true; updateButtonStates(); });
    window.electronAPI.onMountTerminated(() => { isMounted = false; updateButtonStates(); });

    // --- Initialization ---
    async function initialize() {
        log('Applikationen startad. Söker efter rclone...', 'info');
        rcloneAvailable = await window.electronAPI.checkRclone();
        
        if (rcloneAvailable) {
            log('rclone hittades.', 'success');
        } else {
            log('Kommandot rclone hittades inte i PATH. Vänligen installera det.', 'error');
        }

        profiles = await window.electronAPI.loadProfiles();
        populateProfileSelect();
        loadProfileIntoForm();
    }

    initialize();
});