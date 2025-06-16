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
    };
    
    // An array of all inputs for easy processing
    const allFormInputs = [ui.profileNameInput, ui.endpointUrlInput, ui.accessKeyInput, ui.secretKeyInput, ui.configPasswordInput, ui.mountPointInput];

    // --- Application State ---
    let profiles = {};
    let isMounted = false;

    // --- UI Update Functions ---
    function updateButtonStates() {
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
            ui.btnMount.disabled = false;
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
        ui.profileSelect.innerHTML = '<option value="">-- New Profile --</option>';
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
                 ui.bucketSelect.innerHTML = '<option value="">-- Select a bucket --</option>';
            }
        } else {
            allFormInputs.forEach(input => input.value = '');
            ui.bucketSelect.innerHTML = '<option value="">-- Enter credentials to list buckets --</option>';
        }
        updateButtonStates();
    }

    // --- Event Listeners and Handlers ---

    async function handleRefreshBuckets() {
        const profileForListing = {
            profileName: ui.profileNameInput.value.trim(),
            endpoint: ui.endpointUrlInput.value.trim(),
            accessKey: ui.accessKeyInput.value.trim(),
            secretKey: ui.secretKeyInput.value,
            configPassword: ui.configPasswordInput.value,
        };

        if (!profileForListing.endpoint || !profileForListing.accessKey || !profileForListing.secretKey) {
            return log('Endpoint, Access Key, and Secret Key are required to list buckets.', 'warn');
        }
        
        log('Fetching bucket list...', 'info');
        ui.btnRefreshBuckets.disabled = true;

        const result = await window.electronAPI.listBuckets(profileForListing);
        
        const currentBucket = ui.bucketSelect.value;
        ui.bucketSelect.innerHTML = ''; // Clear existing options

        if (result && result.success) {
            if (result.buckets.length === 0) {
                ui.bucketSelect.innerHTML = '<option value="">-- No buckets found --</option>';
            } else {
                result.buckets.forEach(bucket => {
                    const option = document.createElement('option');
                    option.value = bucket;
                    option.textContent = bucket;
                    ui.bucketSelect.appendChild(option);
                });
                log(`Successfully loaded ${result.buckets.length} buckets.`, 'success');
            }
            if (result.buckets.includes(currentBucket)) {
                ui.bucketSelect.value = currentBucket;
            }
        } else {
            log(`Failed to load buckets. Check credentials.`, 'error');
            ui.bucketSelect.innerHTML = '<option value="">-- Error loading buckets --</option>';
        }
        updateButtonStates();
    }
    
    ui.btnRefreshBuckets.addEventListener('click', handleRefreshBuckets);
    [ui.endpointUrlInput, ui.accessKeyInput, ui.secretKeyInput].forEach(input => input.addEventListener('input', updateButtonStates));
    ui.profileSelect.addEventListener('change', loadProfileIntoForm);
    
    ui.btnBrowse.addEventListener('click', async () => {
        const path = await window.electronAPI.browseMountPoint();
        if (path) ui.mountPointInput.value = path;
    });

    ui.btnSaveProfile.addEventListener('click', async () => {
        const profileName = ui.profileNameInput.value.trim();
        if (!profileName) return log('Profile Name cannot be empty.', 'error');
        
        profiles[profileName] = {
            profileName,
            endpoint: ui.endpointUrlInput.value.trim(),
            accessKey: ui.accessKeyInput.value.trim(),
            secretKey: ui.secretKeyInput.value,
            bucketName: ui.bucketSelect.value,
            mountPoint: ui.mountPointInput.value.trim(),
        };

        await window.electronAPI.saveProfiles(profiles);
        populateProfileSelect();
        ui.profileSelect.value = profileName;
        log(`Profile "${profileName}" saved.`, 'success');
        updateButtonStates();
    });

    ui.btnDeleteProfile.addEventListener('click', async () => {
        const selectedProfileName = ui.profileSelect.value;
        if (selectedProfileName && confirm(`Delete profile "${selectedProfileName}"?`)) {
            delete profiles[selectedProfileName];
            await window.electronAPI.saveProfiles(profiles);
            ui.profileSelect.value = "";
            loadProfileIntoForm();
            populateProfileSelect();
            log(`Profile "${selectedProfileName}" deleted.`, 'info');
        }
    });

    ui.btnMount.addEventListener('click', () => {
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
            return log('Please fill all configuration fields before mounting.', 'error');
        }
        window.electronAPI.mount(profileData);
    });

    ui.btnUnmount.addEventListener('click', () => window.electronAPI.unmount());

    // --- IPC Event Handlers from Main Process ---
    window.electronAPI.onStatusUpdate(({ message, type }) => log(message, type));
    window.electronAPI.onMountSuccessful(() => { isMounted = true; updateButtonStates(); });
    window.electronAPI.onMountTerminated(() => { isMounted = false; updateButtonStates(); });

    // --- Initialization ---
    async function initialize() {
        log('Application started. Checking for rclone...', 'info');
        const rcloneExists = await window.electronAPI.checkRclone();
        if (rcloneExists) {
            log('rclone detected successfully.', 'success');
            ui.rcloneStatus.textContent = 'rclone OK';
            ui.rcloneStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-green-600/50 text-green-300 border border-green-500/50';
        } else {
            log('rclone command not found in PATH. Please install it.', 'error');
            ui.btnMount.disabled = true;
        }

        profiles = await window.electronAPI.loadProfiles();
        populateProfileSelect();
        loadProfileIntoForm();
    }

    initialize();
});
