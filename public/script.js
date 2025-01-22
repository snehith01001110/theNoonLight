document.addEventListener("DOMContentLoaded", function() {
    const collage = document.getElementById('collage');
    let masonry;
    
    // Function to calculate number of columns that fit in viewport
    function calculateColumns() {
        const containerWidth = collage.offsetWidth;
        const minColumnWidth = 200; // Base width of an item
        const gutter = 15;
        // Calculate how many columns can fit
        const numColumns = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
        return Math.max(1, numColumns); // Ensure at least 1 column
    }

    // Function to initialize or reinitialize masonry
    function initMasonry() {
        const columns = calculateColumns();
        
        // Destroy existing masonry instance if it exists
        if (masonry) {
            masonry.destroy();
        }

        masonry = new Masonry(collage, {
            itemSelector: '.grid-item',
            columnWidth: '.grid-sizer',
            gutter: 15,
            fitWidth: true,
            initLayout: false // Don't layout immediately
        });
    }

    fetch('/images')
        .then(response => response.json())
        .then(images => {
            // Clear existing content
            collage.innerHTML = '';
            
            // Add grid sizer element
            const gridSizer = document.createElement('div');
            gridSizer.className = 'grid-sizer';
            gridSizer.style.width = '200px';
            collage.appendChild(gridSizer);

            // Randomize image order
            images.sort(() => Math.random() - 0.5);
            
            // Create and append image elements
            images.forEach(image => {
                const gridItem = document.createElement('div');
                gridItem.className = 'grid-item';
                
                const img = document.createElement('img');
                img.src = `/images/${image}`;
                
                // Check image dimensions once loaded
                img.onload = function() {
                    // Only make it horizontal if there's enough space
                    if (this.naturalWidth > this.naturalHeight && collage.offsetWidth >= 430) {
                        gridItem.classList.add('horizontal');
                    }
                    masonry?.layout();
                };
                
                gridItem.appendChild(img);
                collage.appendChild(gridItem);
            });

            // Initialize masonry
            initMasonry();

            // Layout after all images are loaded
            imagesLoaded(collage).on('always', function() {
                masonry.layout();
            });
        })
        .catch(error => console.error('Error fetching images:', error));

    // Handle window resize with debounce
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            initMasonry();
            masonry.layout();
        }, 100);
    });
});