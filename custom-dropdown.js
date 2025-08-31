function initializeCustomDropdown(selectElement) {
    console.log('Initializing dropdown for selectElement:', selectElement.id || selectElement.name, 'with', selectElement.options.length, 'options.'); // Add this line

    const wrapper = selectElement.closest('.custom-select-wrapper'); // Find the closest wrapper
    if (!wrapper) {
        console.error("No .custom-select-wrapper found for select element:", selectElement);
        return;
    }

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const optionsList = wrapper.querySelector('.custom-options');

    if (!selectElement || !trigger || !optionsList) {
        console.error("Missing elements in custom-select-wrapper:", wrapper);
        return;
    }

    // Set initial display text based on current value
    const selectedOption = Array.from(selectElement.options).find(option => option.value === selectElement.value);
    if (selectedOption) {
        trigger.textContent = selectedOption.textContent;
    } else if (selectElement.options.length > 0) {
        // Fallback to the first option's text if no matching value is found or selectedIndex is -1
        trigger.textContent = selectElement.options[0].textContent;
        // Optionally, set the select element's value to the first option's value
        // selectElement.value = selectElement.options[0].value;
    } else {
        trigger.textContent = "選択してください"; // Default text if no options
    }


    // Clear existing custom options to prevent duplicates on re-initialization
    optionsList.innerHTML = '';

    // Populate custom options
    Array.from(selectElement.options).forEach(function(option) {
        const customOption = document.createElement('div');
        customOption.classList.add('custom-option');
        if (option.selected) {
            customOption.classList.add('selected');
        }
        customOption.dataset.value = option.value;
        customOption.textContent = option.textContent;
        optionsList.appendChild(customOption);

        customOption.addEventListener('click', function() {
            selectElement.value = this.dataset.value;
            trigger.textContent = this.textContent;
            optionsList.classList.remove('active');
            // Update selected class
            Array.from(optionsList.children).forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            selectElement.dispatchEvent(new Event('change')); // Trigger change event for original select
        });
    });

    trigger.addEventListener('click', function(event) {
        // Stop the click from bubbling up to the document handler
        event.stopPropagation(); 
        
        // Close all other dropdowns
        document.querySelectorAll('.custom-select-wrapper .custom-options.active').forEach(function(otherOptions) {
            if (otherOptions !== optionsList) {
                otherOptions.classList.remove('active');
                otherOptions.closest('.custom-select-wrapper').querySelector('.custom-select-trigger').classList.remove('active');
            }
        });

        // Toggle the current dropdown
        optionsList.classList.toggle('active');
        trigger.classList.toggle('active');
    });
}

function initializeAllDropdowns() {
    document.querySelectorAll('.custom-select-target').forEach(selectElement => {
        initializeCustomDropdown(selectElement);
    });
}

// Make it globally available for manual re-initialization
window.initializeAllDropdowns = initializeAllDropdowns;

// Close dropdowns when clicking outside
document.addEventListener('click', function() {
    document.querySelectorAll('.custom-select-wrapper .custom-options.active').forEach(function(options) {
        options.classList.remove('active');
        options.closest('.custom-select-wrapper').querySelector('.custom-select-trigger').classList.remove('active');
    });
});

