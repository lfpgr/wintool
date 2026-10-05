/**
 * Dashboard widget registry
 *
 * Registers every dashboard widget so profiles can add any of them.
 * Tab-folder widgets are shortcut cards that call window.switchToTab.
 */
(function (global) {
    'use strict';

    const widgets = new Map();
    const GROUP_ORDER = ['Status', 'Lab', 'Shortcuts'];

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function switchTo(tabId) {
        const go = () => {
            if (typeof global.switchToTab === 'function') {
                global.switchToTab(tabId);
            }
        };
        if (document.getElementById(`tab-${tabId}`)) {
            go();
            return;
        }
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            if (document.getElementById(`tab-${tabId}`) || tries > 40) {
                clearInterval(timer);
                go();
            }
        }, 100);
    }

    function renderShortcutCard(container, widget, tabId) {
        container.innerHTML = `
            <button type="button" class="feature-card dashboard-widget-card dashboard-widget-card--action"
                data-tab-target="${escapeHtml(tabId)}">
                <i class="${escapeHtml(widget.icon)}"></i>
                <h4>${escapeHtml(widget.name)}</h4>
                <p>${escapeHtml(widget.description || '')}</p>
            </button>
        `;
        const card = container.querySelector('.dashboard-widget-card');
        card.addEventListener('click', () => switchTo(tabId));
    }

    function renderStatusCard(container, widget, statusText) {
        container.innerHTML = `
            <div class="feature-card dashboard-widget-card dashboard-widget-card--status">
                <i class="${escapeHtml(widget.icon)}"></i>
                <h4>${escapeHtml(widget.name)}</h4>
                <p class="dashboard-widget-status">${escapeHtml(statusText)}</p>
            </div>
        `;
    }

    /**
     * @param {{id: string, name?: string, icon?: string, group?: string, description?: string, render: Function}} widget
     */
    function register(widget) {
        if (!widget || !widget.id) {
            throw new Error('Widget requires an id');
        }
        const stored = {
            id: widget.id,
            name: widget.name || widget.id,
            icon: widget.icon || 'fas fa-cube',
            group: widget.group || 'Shortcuts',
            description: widget.description || '',
            render: widget.render,
        };
        if (typeof stored.render === 'function') {
            stored.render = stored.render.bind(stored);
        }
        widgets.set(widget.id, stored);
        return widget.id;
    }

    function get(id) {
        return widgets.get(id) || null;
    }

    function getAll() {
        return Array.from(widgets.values());
    }

    function getGroups() {
        const grouped = new Map();
        GROUP_ORDER.forEach(group => grouped.set(group, []));
        widgets.forEach(widget => {
            const group = widget.group || 'Shortcuts';
            if (!grouped.has(group)) {
                grouped.set(group, []);
            }
            grouped.get(group).push(widget);
        });
        return grouped;
    }

    function registerTabShortcut({ id, name, icon, description }) {
        register({
            id,
            name,
            icon,
            group: 'Shortcuts',
            description,
            render(container) {
                renderShortcutCard(container, this, id);
            },
        });
    }

    register({
        id: 'usb-status',
        name: 'USB Status',
        icon: 'fab fa-usb',
        group: 'Status',
        description: 'USB device status',
        render(container) {
            renderStatusCard(container, this, 'USB: …');
            const api = global.electronAPI;
            if (!api || typeof api.usbListMediaDrives !== 'function') {
                renderStatusCard(container, this, 'USB: —');
                return;
            }
            api.usbListMediaDrives()
                .then(result => {
                    const list = (result && result.drives) || [];
                    const text = list.length
                        ? `USB: ${list.map(d => d.drive).join(', ')}`
                        : 'USB: not found';
                    renderStatusCard(container, this, text);
                })
                .catch(() => renderStatusCard(container, this, 'USB: —'));
        },
    });

    register({
        id: 'disk-free',
        name: 'Disk Free',
        icon: 'fas fa-hdd',
        group: 'Status',
        description: 'Free disk space',
        render(container) {
            renderStatusCard(container, this, 'Disk: …');
            const api = global.electronAPI;
            if (!api || typeof api.getDiskSpace !== 'function') {
                renderStatusCard(container, this, 'Disk: —');
                return;
            }
            api.getDiskSpace()
                .then(info => {
                    const free = Number(info && info.free) || 0;
                    const total = Number(info && info.total) || 0;
                    if (!total) {
                        renderStatusCard(container, this, 'Disk: —');
                        return;
                    }
                    const gb = n => (n / 1024 / 1024 / 1024).toFixed(1);
                    renderStatusCard(container, this, `C: ${gb(free)} / ${gb(total)} GB free`);
                })
                .catch(() => renderStatusCard(container, this, 'Disk: —'));
        },
    });

    register({
        id: 'lab-activation',
        name: 'Lab Activation',
        icon: 'fas fa-bolt',
        group: 'Lab',
        description: 'Open Apps to activate lab tools',
        render(container) {
            container.innerHTML = `
                <div class="feature-card dashboard-widget-card dashboard-widget-card--lab">
                    <i class="${escapeHtml(this.icon)}"></i>
                    <h4>${escapeHtml(this.name)}</h4>
                    <p>${escapeHtml(this.description)}</p>
                    <button type="button" class="btn btn-primary dashboard-lab-open-btn">
                        <i class="fas fa-th"></i> Open Apps
                    </button>
                </div>
            `;
            container.querySelector('.dashboard-lab-open-btn').addEventListener('click', event => {
                event.stopPropagation();
                switchTo('apps');
            });
        },
    });

    registerTabShortcut({
        id: 'apps',
        name: 'Apps',
        icon: 'fas fa-th',
        description: 'Application management',
    });

    const TAB_SHORTCUTS = [
        {
            id: 'services',
            name: 'Services',
            icon: 'fas fa-cogs',
            description: 'Start, stop, and monitor Windows services',
        },
        {
            id: 'processes',
            name: 'Processes',
            icon: 'fas fa-microchip',
            description: 'View and manage running processes',
        },
        {
            id: 'system-info',
            name: 'System Info',
            icon: 'fas fa-desktop',
            description: 'Hardware details and performance metrics',
        },
        {
            id: 'cleanup',
            name: 'Cleanup',
            icon: 'fas fa-broom',
            description: 'Clean temporary files and optimize Windows',
        },
        {
            id: 'packages',
            name: 'Packages',
            icon: 'fas fa-box',
            description: 'Install and manage packages with winget',
        },
        {
            id: 'networking',
            name: 'Networking',
            icon: 'fas fa-network-wired',
            description: 'Network interfaces and connectivity',
        },
        {
            id: 'tweaks',
            name: 'Tweaks',
            icon: 'fas fa-magic',
            description: 'Customize the Windows 10/11 experience',
        },
        {
            id: 'system-health',
            name: 'System Health',
            icon: 'fas fa-heartbeat',
            description: 'Real-time performance and health monitoring',
        },
        {
            id: 'system-utilities',
            name: 'System Utilities',
            icon: 'fas fa-tools',
            description: 'Quick access to Windows administrative tools',
        },
        {
            id: 'windows-unattend',
            name: 'Windows Unattend',
            icon: 'fas fa-robot',
            description: 'Create unattend.xml for automated installs',
        },
        {
            id: 'registry-editor',
            name: 'Registry Editor',
            icon: 'fas fa-edit',
            description: 'Browse and manage the Windows Registry',
        },
        {
            id: 'script-editor',
            name: 'Script Editor',
            icon: 'fas fa-code',
            description: 'Edit and run scripts',
        },
        {
            id: 'event-viewer',
            name: 'Event Viewer',
            icon: 'fas fa-clipboard-list',
            description: 'Browse and search Windows Event Logs',
        },
        {
            id: 'environment-variables',
            name: 'Environment Variables',
            icon: 'fas fa-code',
            description: 'Manage system and user environment variables',
        },
        {
            id: 'appx-packages',
            name: 'AppX Packages',
            icon: 'fas fa-cube',
            description: 'Install and uninstall AppX packages',
        },
        {
            id: 'about',
            name: 'About',
            icon: 'fas fa-info-circle',
            description: 'Information about WinTool',
        },
    ];

    TAB_SHORTCUTS.forEach(registerTabShortcut);

    global.WidgetRegistry = {
        register,
        get,
        getAll,
        getGroups,
        GROUP_ORDER,
        escapeHtml,
    };
})(window);
