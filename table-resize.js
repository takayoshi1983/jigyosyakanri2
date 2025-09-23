// Table Column Resizing Functionality
class TableColumnResizer {
    constructor(tableSelector) {
        this.table = document.querySelector(tableSelector);
        this.isResizing = false;
        this.currentColumn = null;
        this.startX = 0;
        this.startWidth = 0;
        this.resizeIndicator = null;
        
        this.init();
    }

    init() {
        if (!this.table) {
            console.warn('Table not found for resizing');
            return;
        }

        // Add resizable class to table
        this.table.classList.add('resizable-table');
        
        // Create resize indicator
        this.createResizeIndicator();
        
        // Add resize handles to header columns
        this.addResizeHandles();
        
        // Bind events
        this.bindEvents();
        
        // Load saved column widths
        this.loadColumnWidths();
    }

    createResizeIndicator() {
        this.resizeIndicator = document.createElement('div');
        this.resizeIndicator.className = 'resize-indicator';
        document.body.appendChild(this.resizeIndicator);
    }

    addResizeHandles() {
        const headers = this.table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            // Skip the last column (usually edit buttons)
            if (index === headers.length - 1) return;
            
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            handle.dataset.columnIndex = index;
            
            // Add tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'resize-tooltip';
            tooltip.textContent = 'ドラッグして幅を調整';
            handle.appendChild(tooltip);
            
            header.appendChild(handle);
            
            // Set data attribute for column identification
            const columnName = this.getColumnName(header, index);
            header.setAttribute('data-column', columnName);
        });
    }

    getColumnName(header, index) {
        const text = header.textContent.trim().toLowerCase();
        const nameMap = {
            'id': 'id',
            '事業所名': 'name', 
            '決算月': 'fiscal',
            '未入力期間': 'unattended',
            '月次進捗': 'progress',
            '最終更新': 'updated',
            '担当者': 'staff',
            '経理方式': 'accounting',
            '進捗ステータス': 'status',
            '編集': 'edit'
        };
        return nameMap[text] || `column_${index}`;
    }

    bindEvents() {
        // Mouse events for desktop
        this.table.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Touch events for mobile with passive optimization
        this.table.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        
        // Prevent default drag behavior
        this.table.addEventListener('dragstart', (e) => e.preventDefault());
    }

    handleMouseDown(e) {
        if (!e.target.classList.contains('resize-handle')) return;
        this.startResize(e, e.clientX);
    }

    handleTouchStart(e) {
        if (!e.target.classList.contains('resize-handle')) return;
        e.preventDefault();
        this.startResize(e, e.touches[0].clientX);
    }

    startResize(e, clientX) {
        this.isResizing = true;
        this.currentColumn = e.target.parentNode;
        this.startX = clientX;
        this.startWidth = this.currentColumn.offsetWidth;
        
        // Visual feedback
        this.table.classList.add('resizing');
        e.target.classList.add('dragging');
        
        // Position resize indicator
        this.updateResizeIndicator(clientX);
        this.resizeIndicator.classList.add('active');
        
        // Prevent text selection
        document.body.style.userSelect = 'none';
    }

    handleMouseMove(e) {
        if (!this.isResizing) return;
        this.updateResize(e.clientX);
    }

    handleTouchMove(e) {
        if (!this.isResizing) return;
        e.preventDefault();
        this.updateResize(e.touches[0].clientX);
    }

    updateResize(clientX) {
        const diff = clientX - this.startX;
        const newWidth = Math.max(50, Math.min(500, this.startWidth + diff));
        
        // Update column width
        this.currentColumn.style.width = newWidth + 'px';
        
        // Update resize indicator position
        this.updateResizeIndicator(clientX);
        
        // Trigger table layout recalculation
        this.table.style.tableLayout = 'fixed';
    }

    handleMouseUp(e) {
        this.endResize();
    }

    handleTouchEnd(e) {
        this.endResize();
    }

    endResize() {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        
        // Clean up visual feedback
        this.table.classList.remove('resizing');
        this.resizeIndicator.classList.remove('active');
        document.body.style.userSelect = '';
        
        // Remove dragging class from all handles
        this.table.querySelectorAll('.resize-handle').forEach(handle => {
            handle.classList.remove('dragging');
        });
        
        // Save column widths
        this.saveColumnWidths();
        
        this.currentColumn = null;
    }

    updateResizeIndicator(clientX) {
        const tableRect = this.table.getBoundingClientRect();
        this.resizeIndicator.style.left = clientX + 'px';
        this.resizeIndicator.style.top = tableRect.top + 'px';
        this.resizeIndicator.style.height = tableRect.height + 'px';
    }

    saveColumnWidths() {
        const widths = {};
        const headers = this.table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            const columnName = header.getAttribute('data-column');
            if (columnName) {
                widths[columnName] = header.offsetWidth;
            }
        });
        
        localStorage.setItem('tableColumnWidths', JSON.stringify(widths));
        toast.info('列幅設定を保存しました', { duration: 2000 });
    }

    loadColumnWidths() {
        try {
            const savedWidths = localStorage.getItem('tableColumnWidths');
            if (!savedWidths) return;
            
            const widths = JSON.parse(savedWidths);
            const headers = this.table.querySelectorAll('thead th');
            
            headers.forEach(header => {
                const columnName = header.getAttribute('data-column');
                if (columnName && widths[columnName]) {
                    header.style.width = widths[columnName] + 'px';
                }
            });
            
            this.table.style.tableLayout = 'fixed';
        } catch (error) {
            console.warn('Failed to load column widths:', error);
        }
    }

    resetColumnWidths() {
        const headers = this.table.querySelectorAll('thead th');
        headers.forEach(header => {
            header.style.width = '';
        });
        
        this.table.style.tableLayout = 'auto';
        localStorage.removeItem('tableColumnWidths');
        toast.success('列幅をリセットしました');
    }

    // Public method to get column widths info
    getColumnWidthsInfo() {
        const headers = this.table.querySelectorAll('thead th');
        const info = [];
        
        headers.forEach(header => {
            const columnName = header.getAttribute('data-column');
            if (columnName) {
                info.push({
                    name: columnName,
                    title: header.textContent.trim(),
                    width: header.offsetWidth
                });
            }
        });
        
        return info;
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize table resizer for main clients table
    window.tableResizer = new TableColumnResizer('#clients-table');
});

// Export for manual initialization if needed
window.TableColumnResizer = TableColumnResizer;