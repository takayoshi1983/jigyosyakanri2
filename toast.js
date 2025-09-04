// Toast Notification System
class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = new Map();
        this.nextId = 1;
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        if (!document.querySelector('.toast-container')) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    show(message, type = 'info', options = {}) {
        const {
            duration = this.getDefaultDuration(type),
            closeable = true,
            persistent = false
        } = options;

        const toastId = this.nextId++;
        const toast = this.createToast(message, type, toastId, closeable);
        
        this.container.appendChild(toast);
        this.toasts.set(toastId, toast);

        // Trigger animation with slight delay for natural feel
        requestAnimationFrame(() => {
            setTimeout(() => {
                toast.classList.add('show');
            }, 50);
        });

        // Auto hide (unless persistent)
        if (!persistent && duration > 0) {
            setTimeout(() => {
                this.hide(toastId);
            }, duration);
        }

        return toastId;
    }

    createToast(message, type, id, closeable) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.toastId = id;

        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        toast.appendChild(messageSpan);

        if (closeable) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = '×';
            closeBtn.addEventListener('click', () => {
                this.hide(id);
            });
            toast.appendChild(closeBtn);
        }

        return toast;
    }

    hide(toastId) {
        const toast = this.toasts.get(toastId);
        if (!toast) return;

        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.toasts.delete(toastId);
            // Reposition remaining toasts smoothly
            this.repositionToasts();
        }, 500); // Match CSS transition duration
    }

    hideAll() {
        this.toasts.forEach((toast, id) => {
            this.hide(id);
        });
    }

    // Update existing toast (useful for loading -> success/error)
    update(toastId, message, type, options = {}) {
        const toast = this.toasts.get(toastId);
        if (!toast) return;

        const messageSpan = toast.querySelector('span');
        if (messageSpan) {
            messageSpan.textContent = message;
        }

        // Update type
        toast.className = `toast ${type} show`;

        // Handle auto-hide for updated toasts
        const { duration = this.getDefaultDuration(type), persistent = false } = options;
        if (!persistent && duration > 0) {
            setTimeout(() => {
                this.hide(toastId);
            }, duration);
        }
    }

    repositionToasts() {
        // Smooth repositioning animation for remaining toasts
        const toasts = Array.from(this.container.children);
        toasts.forEach((toast, index) => {
            if (toast.classList.contains('show')) {
                toast.style.transition = 'transform 0.3s ease-out';
                setTimeout(() => {
                    toast.style.transition = ''; // Reset to original transition
                }, 300);
            }
        });
    }

    getDefaultDuration(type) {
        switch (type) {
            case 'loading':
                return 0; // Persistent until manually hidden
            case 'success':
                return 4000; // Slightly longer for better readability
            case 'info':
                return 5000;
            case 'warning':
                return 6000;
            case 'error':
                return 8000; // Longer for errors
            default:
                return 5000;
        }
    }

    // Convenience methods
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    loading(message, options = {}) {
        return this.show(message, 'loading', { ...options, persistent: true, closeable: false });
    }
}

// Global instance
window.toast = new ToastManager();

// Legacy compatibility functions for existing code
window.showToast = function(message, type = 'info', options = {}) {
    return window.toast.show(message, type, options);
};

window.showStatus = function(message, type = 'info') {
    // Map legacy types to toast types
    const typeMap = {
        'success': 'success',
        'error': 'error', 
        'warning': 'warning',
        'info': 'info'
    };
    
    const toastType = typeMap[type] || 'info';
    return window.toast.show(message, toastType);
};

window.hideStatus = function() {
    // Legacy function - now does nothing as toasts auto-hide
};

window.showLoadingIndicator = function(message = 'データを読み込み中...') {
    return window.toast.loading(message);
};

window.hideLoadingIndicator = function() {
    // Hide all loading toasts
    window.toast.toasts.forEach((toast, id) => {
        if (toast.classList.contains('loading')) {
            window.toast.hide(id);
        }
    });
};