document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileSideNav = document.getElementById('mobile-side-nav');
    const mobileNavLinks = document.querySelectorAll('.kr-mobile-navbar a, #mobile-side-nav a');
    const clickAudio = document.getElementById('node-click-audio');

    function playClickSound() {
        if (clickAudio) {
            clickAudio.currentTime = 0;
            clickAudio.play();
        }
    }

    if (hamburgerBtn && mobileSideNav) {
        hamburgerBtn.addEventListener('click', () => {
            mobileSideNav.classList.toggle('open');
            playClickSound();
        });
    }

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                e.preventDefault();
                playClickSound();

                setTimeout(() => {
                    window.location.href = href;
                }, 300);
            } else {
                playClickSound();
            }
        });
    });
}); 