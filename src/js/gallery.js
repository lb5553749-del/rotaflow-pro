/**
 * Galeria em tela cheia das fotos de comprovação.
 * Sem estado de rota — só o DOM da #fullscreenGallery.
 */

let currentGalleryPhotos = null;
let currentGalleryIndex = 0;
let gallerySwipeBound = false;

function updateGalleryChrome() {
    const counter = document.getElementById('galleryCounter');
    const prevBtn = document.getElementById('prevPhotoBtn');
    const nextBtn = document.getElementById('nextPhotoBtn');
    const total = currentGalleryPhotos ? currentGalleryPhotos.length : 0;
    const idx = currentGalleryIndex;
    if (counter) {
        if (total > 1) {
            counter.hidden = false;
            counter.textContent = `${idx + 1} / ${total}`;
        } else {
            counter.hidden = true;
            counter.textContent = '';
        }
    }
    if (prevBtn) prevBtn.disabled = !(total > 1 && idx > 0);
    if (nextBtn) nextBtn.disabled = !(total > 1 && idx < total - 1);
}

function showGalleryPhotoAt(index, direction = 0) {
    const img = document.getElementById('galleryImg');
    if (!currentGalleryPhotos || !img) return;
    if (index < 0 || index >= currentGalleryPhotos.length) return;
    currentGalleryIndex = index;
    if (direction !== 0) {
        img.classList.remove('gallery-swipe-out-left', 'gallery-swipe-out-right');
        void img.offsetWidth;
        img.classList.add(direction > 0 ? 'gallery-swipe-out-left' : 'gallery-swipe-out-right');
        requestAnimationFrame(() => {
            img.src = currentGalleryPhotos[currentGalleryIndex];
            img.classList.remove('gallery-swipe-out-left', 'gallery-swipe-out-right');
            updateGalleryChrome();
        });
    } else {
        img.src = currentGalleryPhotos[index];
        updateGalleryChrome();
    }
}

export function openGallery(photos, index) {
    const gallery = document.getElementById('fullscreenGallery');
    if (!photos || photos.length === 0) return;
    currentGalleryPhotos = photos;
    currentGalleryIndex = Math.max(0, Math.min(index || 0, photos.length - 1));
    showGalleryPhotoAt(currentGalleryIndex, 0);
    if (gallery) gallery.style.display = 'flex';
}

export function closeGallery() {
    const gallery = document.getElementById('fullscreenGallery');
    if (gallery) gallery.style.display = 'none';
    currentGalleryPhotos = null;
    const img = document.getElementById('galleryImg');
    if (img) {
        img.classList.remove('gallery-swipe-out-left', 'gallery-swipe-out-right');
        img.removeAttribute('src');
    }
    updateGalleryChrome();
}

export function nextPhoto() {
    if (!currentGalleryPhotos || currentGalleryIndex >= currentGalleryPhotos.length - 1) return;
    showGalleryPhotoAt(currentGalleryIndex + 1, 1);
}

export function prevPhoto() {
    if (!currentGalleryPhotos || currentGalleryIndex <= 0) return;
    showGalleryPhotoAt(currentGalleryIndex - 1, -1);
}

export function isGalleryOpen() {
    const gallery = document.getElementById('fullscreenGallery');
    return !!(gallery && gallery.style.display === 'flex');
}

export function setupGallerySwipe() {
    const gallery = document.getElementById('fullscreenGallery');
    if (!gallery || gallerySwipeBound) return;
    gallerySwipeBound = true;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let moved = false;

    gallery.addEventListener('touchstart', (e) => {
        if (!currentGalleryPhotos || e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
        moved = false;
    }, { passive: true });

    gallery.addEventListener('touchmove', (e) => {
        if (!tracking || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) moved = true;
    }, { passive: true });

    gallery.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        if (!moved || !currentGalleryPhotos || currentGalleryPhotos.length < 2) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        if (dx < 0) nextPhoto();
        else prevPhoto();
    }, { passive: true });

    gallery.addEventListener('touchcancel', () => { tracking = false; moved = false; }, { passive: true });
}

export function bindGalleryChrome() {
    document.getElementById('closeGalleryBtn')?.addEventListener('click', closeGallery);
    document.getElementById('prevPhotoBtn')?.addEventListener('click', prevPhoto);
    document.getElementById('nextPhotoBtn')?.addEventListener('click', nextPhoto);
    document.getElementById('fullscreenGallery')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('fullscreenGallery')) closeGallery();
    });
    setupGallerySwipe();
}
