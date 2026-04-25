// script.js

// Intersection Observer for fade-in animations on scroll
document.addEventListener("DOMContentLoaded", () => {
    const observerOptions = {
        root: null,
        rootMargin: "0px",
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-in-up');
    animatedElements.forEach(el => observer.observe(el));

    // Simple Parallax Effect for Background Orbs during scroll
    const orbs = document.querySelectorAll('.glow-orb');
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        orbs.forEach((orb, index) => {
            const speed = (index + 1) * 0.15;
            orb.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });
});
